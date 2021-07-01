import fs from 'fs';

export function mkdir(path, recursive = false) {
  return new Promise((res, rej) => {
    fs.mkdir(path, { recursive }, (err) => err ? rej(err) : res());
  });
}

export function existsFile(path) {
  return fs.existsSync(path);
}

export function linkFile(target, path, hardlink = false) {
  return new Promise((res, rej) => {
    let func = hardlink ? 'link' : 'symlink';
    fs[func](target, path, (err) => {
      if (!err) return res();

      if (err.code === 'EEXIST') {
        unlinkFile(path)
          .then(() => linkFile(target, path, hardlink))
          .then(res).catch(rej);
      } else {
        rej(err);
      }
    });
  });
}

export function copyFile(target, path) {
  return new Promise((res, rej) => {
    fs.copyFile(target, path, (err) => err ? rej(err) : res());
  });
}

export function writeFile(path, text) {
  return new Promise((res, rej) => {
    fs.writeFile(path, text, (err) => err ? rej(err) : res());
  });
}

export function unlinkFile(path) {
  return new Promise((res, rej) => {
    fs.unlink(path, (err) => {
      if (!err || err.code === 'ENOENT') return res();
      rej(err);
    });
  });
}
