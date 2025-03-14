// app.js
const express = require("express");
const { google } = require("googleapis");
const bodyParser = require("body-parser");
const fs = require("fs");

const app = express();
const PORT = 3000;

// Load client secrets from a local file.
const credentials = JSON.parse(fs.readFileSync("credentials.json"));
const { client_id, client_secret, redirect_uris } = credentials.web;

const oauth2Client = new google.auth.OAuth2(
  client_id,
  client_secret,
  redirect_uris[0]
);

app.use(bodyParser.urlencoded({ extended: true }));

app.get("/", (req, res) => {
  res.send("hello world");
});

// Step 1: Redirect to Google for authentication
app.get("/auth", (req, res) => {
  const scopes = ["https://www.googleapis.com/auth/drive"];
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: scopes,
  });
  res.redirect(authUrl);
});

// Step 2: Handle the OAuth2 callback
app.get("/oauth2callback", async (req, res) => {
  const { code } = req.query;
  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);
  res.send(
    'Authentication successful! You can now transfer file ownership. <a href="/transfer">Transfer Ownership</a>'
  );
});

// Step 3: Transfer file ownership
app.get("/transfer", (req, res) => {
  res.send(`
    <form action="/transfer" method="POST">
      <label for="fileId">File ID:</label>
      <input type="text" id="fileId" name="fileId" required>
      <br>
      <label for="newOwnerEmail">New Owner Email:</label>
      <input type="email" id="newOwnerEmail" name="newOwnerEmail" required>
      <br>
      <button type="submit">Transfer Ownership</button>
    </form>
  `);
});

app.post("/transfer", async (req, res) => {
  const { fileId, newOwnerEmail } = req.body;
  const drive = google.drive({ version: "v3", auth: oauth2Client });

  try {
    // Step 1: Retrieve the permissions for the file to find the new owner's permission ID
    const permissionsResponse = await drive.permissions.list({
      fileId: fileId,
      fields: "permissions(id, emailAddress, role)",
    });

    // Find the permission ID for the new owner
    const newOwnerPermission = permissionsResponse.data.permissions.find(
      (permission) => permission.emailAddress === newOwnerEmail
    );

    if (!newOwnerPermission) {
      return res.status(404).send("New owner not found in permissions.");
    }

    // Step 2: Update the permission to transfer ownership
    await drive.permissions.update({
      fileId: fileId,
      permissionId: newOwnerPermission.id,
      requestBody: {
        role: "writer",
        pendingOwner: true,
      },
    });

    res.send(
      `Ownership of file ${fileId} is pending transfer to ${newOwnerEmail}.`
    );
  } catch (error) {
    console.error(error);
    res.status(500).send("Error transferring ownership: " + error.message);
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
