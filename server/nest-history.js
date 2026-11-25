import { digest, encryptedContentsHash, open, readPrivate, rewrap, validateCiphertext, verify } from '../shared/encryption.js';

// A grant belongs to one continuous membership. It also remains an entitlement
// after an edit, when the new ciphertext includes that member directly.
export const historyGrant = (message, member) => `EXISTS(
  SELECT 1 FROM nest_history_grants h WHERE h.message_id=${message}.id AND h.user_id=${member}.user_id)`;
export const nestAudience = (message, member) => `(${historyGrant(message, member)} OR (
  (${message}.id>${member}.joined_after OR (${member}.share_history=1 AND ${message}.message_kind='chat')) AND EXISTS(
    SELECT 1 FROM e2ee_recipients er WHERE er.message_id=${message}.id AND er.user_id=${member}.user_id)))`;

export function installNestHistory({app, db, enabled, device, identity, ensureManaged, vault, refreshUser}) {
  const one = (sql, ...args) => db.prepare(sql).get(...args);
  const all = (sql, ...args) => db.prepare(sql).all(...args);
  const fail = (status, message) => { throw Object.assign(new Error(message), {status}); };
  const source = `
    JOIN groups g ON g.id=m.group_id
    JOIN group_members sender ON sender.group_id=g.id
    JOIN community_members sc ON sc.community_id=g.community_id AND sc.user_id=sender.user_id
    LEFT JOIN nest_history_grants sh ON sh.message_id=m.id AND sh.user_id=sender.user_id AND sh.edit_version=m.edit_version`;
  const target = `
    JOIN group_members recipient ON recipient.group_id=g.id AND recipient.share_history=1 AND recipient.joined_after>=m.id
    JOIN community_members rc ON rc.community_id=g.community_id AND rc.user_id=recipient.user_id`;
  const eligible = `m.e2ee_version=1 AND m.message_kind='chat' AND m.deleted=0
    AND ${nestAudience('m', 'sender')} AND NOT ${nestAudience('m', 'recipient')}`;
  const sourceCiphertext = 'COALESCE(sh.ciphertext,m.ciphertext)';
  const candidate = (messageId, senderId, recipientId) => one(`
    SELECT m.group_id,m.edit_version,${sourceCiphertext} AS ciphertext,recipient.join_token
    FROM messages m ${source} ${target}
    WHERE ${eligible} AND m.id=? AND sender.user_id=? AND recipient.user_id=?`, messageId, senderId, recipientId);

  function save(messageId, senderId, recipientId, expected, recipientKey, ciphertext) {
    const current = candidate(messageId, senderId, recipientId);
    if (!current || current.join_token !== expected.join_token || current.edit_version !== expected.edit_version ||
      current.ciphertext !== expected.ciphertext || identity(recipientId)?.fingerprint !== recipientKey) return false;
    db.prepare('INSERT INTO nest_history_grants VALUES (?,?,?,?,?)').run(messageId, current.group_id, recipientId, current.edit_version, ciphertext);
    return true;
  }

  // Managed keys already reside in the vault. Keep the signed contents intact
  // and use an existing reader's key only while both memberships are eligible.
  async function shareManaged(groupId, recipientId, before, rootId = null) {
    const managedSource = `
      JOIN e2ee_managed_keys k ON k.user_id=sender.user_id
      JOIN e2ee_identities i ON i.user_id=k.user_id AND i.custody='managed' AND i.fingerprint=k.fingerprint`;
    const scope = `FROM messages m ${source} ${target} ${managedSource}
      WHERE ${eligible} AND m.group_id=? AND recipient.user_id=?`;
    const keys = new Map();
    let recipient, remaining = rootId === null ? 100 : 500;
    while (remaining > 0) {
      const matches = all(`SELECT DISTINCT m.id ${scope} AND m.id<?
        AND (? IS NULL OR m.id=? OR m.reply_to=?) ORDER BY m.id DESC LIMIT ?`,
        groupId, recipientId, before, rootId, rootId, rootId, remaining);
      if (!matches.length) return;
      recipient ??= await ensureManaged(recipientId);
      if (!recipient?.public_key) return;
      for (const {id} of matches) {
        const rows = all(`SELECT m.edit_version,${sourceCiphertext} AS ciphertext,recipient.join_token,
          sender.user_id AS sender_id,k.fingerprint,k.encrypted_key,i.public_key,i.history_backup
          ${scope} AND m.id=? ORDER BY sender.user_id`, groupId, recipientId, id);
        for (const row of rows) {
          let ciphertext;
          try {
            if (!keys.has(row.sender_id)) {
              const key = await readPrivate(vault.open(row.sender_id, row.fingerprint, row.encrypted_key));
              const history = row.history_backup ? await open(key, row.public_key, row.history_backup) : null;
              keys.set(row.sender_id, [key, ...await Promise.all((history?.keys || []).map(readPrivate))]);
            }
            ciphertext = await rewrap(keys.get(row.sender_id), recipient.public_key, row.ciphertext);
          } catch {
            // A reader may need an archived key on their device.
            continue;
          }
          if (!one('SELECT 1 FROM e2ee_managed_keys WHERE user_id=? AND fingerprint=?', row.sender_id, row.fingerprint)) continue;
          if (save(id, row.sender_id, recipientId, row, recipient.fingerprint, ciphertext)) {
            remaining--;
            break;
          }
        }
      }
      before = matches.at(-1).id;
    }
  }

  if (enabled) {
    app.get('/api/nest-history', (req, res) => {
      device(req);
      const after = Number(req.query.after ?? 0), recipient = req.query.recipient ?? '';
      if (!Number.isSafeInteger(after) || after < 0 || typeof recipient !== 'string' || recipient.length > 36) fail(400, 'Invalid history cursor.');
      const tasks = all(`
        SELECT m.id,m.edit_version,${sourceCiphertext} AS ciphertext,recipient.join_token,
          i.user_id AS recipient_id,i.public_key,i.fingerprint
        FROM messages m ${source} ${target}
        JOIN e2ee_identities i ON i.user_id=recipient.user_id
        JOIN users u ON u.id=i.user_id AND u.deleted_at IS NULL
        WHERE ${eligible} AND sender.user_id=? AND (m.id>? OR (m.id=? AND recipient.user_id>?))
        ORDER BY m.id,recipient.user_id LIMIT 12`, req.user.id, after, after, recipient);
      res.json({tasks});
    });
    app.post('/api/nest-history/:id', async (req, res) => {
      device(req);
      const messageId = Number(req.params.id);
      const {recipientId, joinToken, editVersion, fingerprint, ciphertext, signature} = req.body;
      if (!Number.isSafeInteger(messageId) || messageId < 1 || typeof recipientId !== 'string' || recipientId.length > 36) {
        fail(400, 'Invalid history share.');
      }
      const row = candidate(messageId, req.user.id, recipientId);
      const key = identity(recipientId);
      if (!row || !key || row.join_token !== joinToken || row.edit_version !== editVersion || key.fingerprint !== fingerprint) {
        return res.json({shared:false});
      }
      const senderKey = identity(req.user.id);
      try {
        await validateCiphertext(ciphertext, [key.public_key]);
        if (await encryptedContentsHash(ciphertext) !== await encryptedContentsHash(row.ciphertext)) throw new Error('Contents changed.');
        await verify(senderKey.public_key, 'nest-history', {
          messageId, recipientId, joinToken, editVersion, fingerprint, cipherHash:await digest(ciphertext),
        }, signature);
      } catch {
        fail(400, 'The encrypted history copy could not be verified.');
      }
      device(req);
      const shared = senderKey.fingerprint === identity(req.user.id)?.fingerprint &&
        save(messageId, req.user.id, recipientId, row, fingerprint, ciphertext);
      if (shared) refreshUser(recipientId);
      res.json({shared});
    });
  }
  return {shareManaged};
}
