const quotedPrintable = require("quoted-printable");
const utf8 = require("utf8");

module.exports = {
  encode(input, encoding) {
    if (encoding === "base64") {
      return this.bodystreamToString(input);
    }
    if (encoding === "quoted-printable") {
      return utf8.decode(quotedPrintable.decode(input.toString()));
    }
    if (encoding === "7bit") {
      return input.toString("ascii");
    }
    return input.toString("utf8");
  },
  bodystreamToString(buf) {
    return Buffer.from(buf.toString(), "base64").toString();
  },
};
