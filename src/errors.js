export class TerminalMismatch extends Error {
  constructor(path, detectedTerminal, useTerminal, pathEnvironment) {
    const message = `Mismatch: resolved path (${path}) looks like a ${pathEnvironment} path but terminal detected as ${detectedTerminal}. Either use a ${useTerminal} terminal or choose a ${detectedTerminal} path.`;
    super(message);
    this.code = this.name = TerminalMismatch.code;
    this.data = {
      path,
      detectedTerminal,
      useTerminal,
      pathEnvironment
    };
  }
}
TerminalMismatch.code = 'TerminalMismatch';

export class RelativePathNotAllowed extends Error {
  constructor(path) {
    super(`Relative paths are not allowed; use absolute paths: ${path}`);
    this.code = this.name = RelativePathNotAllowed.code;
    this.data = { path };
  }
}
RelativePathNotAllowed.code = 'RelativePathNotAllowed';

export class InvalidUri extends Error {
  constructor(uri) {
    super(`Invalid URI: ${uri}`);
    this.code = this.name = InvalidUri.code;
    this.data = { uri };
  }
}
InvalidUri.code = 'InvalidUri';