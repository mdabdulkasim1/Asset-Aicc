'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Works out where the register's data should live.
 *
 * A hosting platform mounts its persistent disk wherever it likes and tells the
 * app through an environment variable. Writing to the wrong folder is the worst
 * kind of bug here: everything looks healthy and the data is gone at the next
 * restart, so the mounted disk wins unless DATA_DIR points inside it.
 */
function resolveDataDir() {
  const explicit = process.env.DATA_DIR;
  const volume = process.env.RAILWAY_VOLUME_MOUNT_PATH;
  const notes = [];

  if (volume) {
    const inside = explicit && (explicit === volume || explicit.startsWith(`${volume}${path.sep}`));
    if (explicit && !inside) {
      notes.push(
        `DATA_DIR is "${explicit}" but the mounted disk is at "${volume}". Using the mounted ` +
          'disk, otherwise everything entered would be lost at the next restart.'
      );
    }
    return { dir: inside ? explicit : volume, notes };
  }

  return { dir: explicit || path.join(__dirname, '..', 'data'), notes };
}

/** Best effort: the mount point the given path sits on, Linux only. */
function mountPointOf(target) {
  let entries;
  try {
    entries = fs.readFileSync('/proc/self/mountinfo', 'utf8').split('\n');
  } catch {
    return null;
  }

  let best = null;
  for (const line of entries) {
    const point = line.split(' ')[4];
    if (!point) continue;
    if (target === point || target.startsWith(point === '/' ? '/' : `${point}/`)) {
      if (!best || point.length > best.length) best = point;
    }
  }
  return best;
}

function inContainer() {
  return (
    fs.existsSync('/.dockerenv') ||
    !!process.env.RAILWAY_SERVICE_ID ||
    !!process.env.RAILWAY_ENVIRONMENT_ID
  );
}

/**
 * Describes where the data actually is and whether it will survive a restart,
 * so the answer is visible in the log and in the app instead of being guessed at.
 */
function describeStorage(dataDir, dbFile) {
  const volume = process.env.RAILWAY_VOLUME_MOUNT_PATH || null;
  const mount = mountPointOf(dataDir);
  const hosted = inContainer();

  let writable = true;
  try {
    fs.accessSync(dataDir, fs.constants.W_OK);
  } catch {
    writable = false;
  }

  // SQLite keeps recent writes in a -wal file beside the database until it is
  // checkpointed, so the main file alone understates how much is stored.
  let exists = false;
  let sizeBytes = 0;
  for (const suffix of ['', '-wal']) {
    try {
      sizeBytes += fs.statSync(`${dbFile}${suffix}`).size;
      if (suffix === '') exists = true;
    } catch {
      /* not created yet */
    }
  }

  // On a normal computer the data folder is simply part of the disk. In a
  // container it only survives if it sits on a mounted volume.
  const onVolume = !!volume || (!!mount && mount !== '/');
  const persistent = hosted ? onVolume : true;

  return {
    data_dir: dataDir,
    db_file: dbFile,
    db_exists: exists,
    db_size_bytes: sizeBytes,
    writable,
    hosted,
    volume_mount: volume,
    mount_point: mount,
    persistent,
  };
}

module.exports = { describeStorage, resolveDataDir };
