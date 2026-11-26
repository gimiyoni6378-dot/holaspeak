'use strict';
const { DatabaseSync } = require('node:sqlite');
const { randomBytes, createHash } = require('node:crypto');
const { progress } = require('./domain');
const hash = value => createHash('sha256').update(value).digest('hex');
function createStore(path) {
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT NOT NULL, progress TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS sessions (hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS assessments (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), reference TEXT NOT NULL, result TEXT NOT NULL, created TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS assessment_user ON assessments(user_id, created);
    CREATE TABLE IF NOT EXISTS audio (key TEXT PRIMARY KEY, content BLOB NOT NULL, created INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS quotas (user_id TEXT, kind TEXT, day TEXT, count INTEGER NOT NULL, PRIMARY KEY(user_id,kind,day));`);
  return {
    db,
    login(identity, guest) {
      db.prepare('INSERT INTO users(id,name,progress) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name').run(identity.sub, identity.name || '학습자', JSON.stringify(progress(guest)));
      db.prepare('DELETE FROM sessions WHERE expires < ?').run(Date.now());
      const token = randomBytes(32).toString('base64url');
      db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(hash(token), identity.sub, Date.now() + 7 * 86400000);
      return { token, ...this.user(identity.sub) };
    },
    user(id) { const row = db.prepare('SELECT * FROM users WHERE id=?').get(id); return { user: { id: row.id, name: row.name }, progress: JSON.parse(row.progress), revision: row.revision }; },
    authenticate(token) { return db.prepare('SELECT user_id FROM sessions WHERE hash=? AND expires>?').get(hash(token), Date.now())?.user_id; },
    logout(token) { db.prepare('DELETE FROM sessions WHERE hash=?').run(hash(token)); },
    save(id, state, revision) { return db.prepare('UPDATE users SET progress=?,revision=revision+1 WHERE id=? AND revision=?').run(JSON.stringify(progress(state)), id, revision).changes > 0; },
    quota(id, kind, max) {
      const day = new Date().toISOString().slice(0, 10);
      db.prepare('DELETE FROM quotas WHERE day < ?').run(day);
      return db.prepare('INSERT INTO quotas VALUES(?,?,?,1) ON CONFLICT(user_id,kind,day) DO UPDATE SET count=count+1 WHERE count < ?').run(id, kind, day, max).changes > 0;
    },
    audio(key) { const row = db.prepare('SELECT content FROM audio WHERE key=?').get(key); return row ? Buffer.from(row.content) : null; },
    putAudio(key, content) { db.prepare('INSERT OR REPLACE INTO audio VALUES(?,?,?)').run(key, content, Date.now()); db.exec('DELETE FROM audio WHERE key IN (SELECT key FROM audio ORDER BY created DESC LIMIT -1 OFFSET 500)'); },
    addAssessment(id, user, reference, result) { const item = { id, reference, result, created: new Date().toISOString() }; db.prepare('INSERT INTO assessments VALUES(?,?,?,?,?)').run(id, user, reference, JSON.stringify(result), item.created); return item; },
    history(id) { return db.prepare('SELECT id,reference,result,created FROM assessments WHERE user_id=? ORDER BY created DESC LIMIT 50').all(id).map(row => ({ ...row, result: JSON.parse(row.result) })); },
    reset(id) {
      db.exec('BEGIN IMMEDIATE');
      try { db.prepare('UPDATE users SET progress=?,revision=revision+1 WHERE id=?').run(JSON.stringify(progress()), id); db.prepare('DELETE FROM assessments WHERE user_id=?').run(id); db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; }
      return this.user(id);
    },
  };
}
module.exports = { createStore };
