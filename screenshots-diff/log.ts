/* The ANSI_ESCAPES codes are used to style the console output */
export const ANSI_ESCAPES = {
  reset: "\x1b[0m",
  escape: "\x1b[",
  saveCursorPosition: "\x1b[s",
  restoreCursorPosition: "\x1b[u",
  clearLine: "\x1b[2K",
  boldOn: "\x1b[1m",
  inverseOn: "\x1b[7m",
  boldOff: "\x1b[22m",
  inverseOff: "\x1b[27m",
  fgBlack: "\x1b[30m",
  fgRed: "\x1b[31m",
  fgGreen: "\x1b[32m",
  fgYellow: "\x1b[33m",
  fgBlue: "\x1b[34m",
  fgMagenta: "\x1b[35m",
  fgCyan: "\x1b[36m",
  fgWhite: "\x1b[37m",
  fgDefault: "\x1b[39m",
  bgGray: "\x1b[40m",
  bgRed: "\x1b[41m",
  bgGreen: "\x1b[42m",
  bgYellow: "\x1b[43m",
  bgBlue: "\x1b[44m",
  bgMagenta: "\x1b[45m",
  bgCyan: "\x1b[46m",
  bgWhite: "\x1b[47m",
  bgDefault: "\x1b[49m"
};

export const errorsLogged: Array<string> = [];

export const log = (message, prefix = "") => console.log(prefix + message);

export const logError = (message, prefix = "") => {
  log(
    prefix +
      ANSI_ESCAPES.boldOn +
      ANSI_ESCAPES.fgRed +
      message +
      ANSI_ESCAPES.reset
  );
  errorsLogged.push(message);
};

export const logWarning = (message, prefix = "") =>
  log(prefix + ANSI_ESCAPES.fgYellow + message + ANSI_ESCAPES.reset);

export const logSuccess = (message, prefix = "") =>
  log(
    prefix +
      ANSI_ESCAPES.boldOn +
      ANSI_ESCAPES.fgGreen +
      message +
      ANSI_ESCAPES.reset
  );

export const logInfo = (message, prefix = "") =>
  log(
    prefix +
      ANSI_ESCAPES.boldOn +
      ANSI_ESCAPES.fgCyan +
      message +
      ANSI_ESCAPES.reset
  );

export const highlight = message => {
  return (
    ANSI_ESCAPES.inverseOn +
    ANSI_ESCAPES.clearLine +
    message.replace(/\n/g, `\n${ANSI_ESCAPES.clearLine}`)
  );
};
