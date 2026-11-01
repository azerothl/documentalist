// Normalize the Windows filesystem contract for mounted volumes that return
// EISDIR for readlink on a regular file. Real symbolic-link errors are preserved.
if (process.platform === "win32") {
  // The preload runs before Next and must use Node's CommonJS loader.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require("node:fs");
  const normalize = (error, path) => {
    if (error?.code === "EISDIR") {
      try {
        if (!fs.lstatSync(path).isSymbolicLink()) {
          error.code = "EINVAL";
          error.errno = -4071;
        }
      } catch {
        /* Preserve the original error when the path disappeared. */
      }
    }
    return error;
  };
  const readlink = fs.readlink;
  fs.readlink = function (path, options, callback) {
    if (typeof options === "function") {
      callback = options;
      options = undefined;
    }
    return readlink.call(fs, path, options, (error, value) =>
      callback(normalize(error, path), value),
    );
  };
  const readlinkSync = fs.readlinkSync;
  fs.readlinkSync = function (path, options) {
    try {
      return readlinkSync.call(fs, path, options);
    } catch (error) {
      throw normalize(error, path);
    }
  };
  const readlinkPromise = fs.promises.readlink;
  fs.promises.readlink = async function (path, options) {
    try {
      return await readlinkPromise.call(fs.promises, path, options);
    } catch (error) {
      throw normalize(error, path);
    }
  };
}
