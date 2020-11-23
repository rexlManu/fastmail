require("dotenv").config();
const express = require("express");
const app = express();
const port = process.env.PORT;
const path = require("path");
const utils = require("./utils");
const rateLimit = require("express-rate-limit");
var http = require('http');
var server = http.createServer(app);

const { ImapFlow } = require("imapflow");

const pino = require("pino")();
pino.level = "silent";

const client = new ImapFlow({
  host: process.env.MAIL_HOST,
  port: process.env.MAIL_PORT,
  secure: process.env.MAIL_TLS,
  auth: {
    user: process.env.MAIL_NAME,
    pass: process.env.MAIL_PASSWORD,
  },
  emitLogs: false,
  logger: pino,
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 500,
  })
);

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.post("/api/mails", async (req, res) => {
  if (!req.body.username)
    return res.status(422).send({ error: "username is missing" });

  var { username } = req.body;
  if (typeof username != "string") {
    return res.status(403).send({ error: "username must be string" });
  }
  var username = username.trim();
  var emails = [];

  if (username == "mail") {
    return res.send({ error: "mail is not allowed as username" }).status(403);
  }

  let lock = await client.getMailboxLock("INBOX");
  try {
    for await (let message of client.fetch("1:*", {
      uid: true,
      flags: true,
      bodyStructure: true,
      envelope: true,
      internalDate: true,
      emailId: true,
      threadId: true,
      xGmLabels: true,
      bodyParts: ["1", "2", "3"],
      headers: ["date", "subject"],
    })) {
      if (message.envelope.to[0].address.split("@")[0] != username) {
        continue;
      }

      var mail = message;
      let emailBody = null;
      let emailAttachment = null;
      let error = null;

      if (!mail.bodyStructure.hasOwnProperty("childNodes")) {
        const { encoding } = mail.bodyStructure;
        emailBody = utils.encode(mail.bodyParts.get("1"), encoding);
      } else {
        const [part1, part2] = mail.bodyStructure.childNodes;

        if (!part1.hasOwnProperty("childNodes")) {
          let { encoding } = part1;
          emailBody = utils.encode(mail.bodyParts.get("1"), encoding);

          if (
            part2.hasOwnProperty("disposition") &&
            part2.disposition === "attachment"
          ) {
            encoding = part2.encoding;
            emailAttachment = utils.encode(mail.bodyParts.get("2"), encoding);
          }
        } else {
          const [part1_1] = part1.childNodes;

          if (part1_1.type === "text/plain") {
            let encoding = "utf8";
            let emailBodyToDecode = utils.encode(
              mail.bodyParts.get("1"),
              encoding
            );
            const { boundary } = part1.parameters;
            emailBodyToDecode = emailBodyToDecode.substring(
              emailBodyToDecode.indexOf("Content-Transfer-Encoding"),
              emailBodyToDecode.indexOf(boundary, 10)
            );
            emailBodyToDecode = emailBodyToDecode.substring(
              emailBodyToDecode.indexOf("\n"),
              emailBodyToDecode.length
            );
            emailBody = utils.encode(emailBodyToDecode, "base64");
            encoding = part2.encoding;

            if (mail.bodyParts.get("3")) {
              emailAttachment = utils.encode(mail.bodyParts.get("3"), encoding);
            } else {
              emailAttachment = utils.encode(mail.bodyParts.get("2"), encoding);
            }
          } else {
            error =
              "Could not decode the email structure (attachment), please check manually";
            let { encoding } = part1_1;
            emailBody = utils.encode(mail.bodyParts.get("1"), encoding);
            encoding = part2.encoding;
            emailAttachment = utils.encode(mail.bodyParts.get("2"), encoding);
          }
        }
      }

      emails.push({
        subject: mail.envelope.subject || "",
        date: mail.envelope.date || "",
        body: emailBody,
        sender: message.envelope.sender[0],
      });
    }
  } finally {
    lock.release();
  }

  res.send(emails);
});

client.connect();

server.on('listening', () => {
    console.log(`Fastmail app listening at http://${process.env.HOST}:${port}`);
})
server.listen(port, process.env.HOST);
