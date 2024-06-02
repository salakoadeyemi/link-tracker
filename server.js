const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const base64url = require('base64url');
const fs = require('fs');
const path = require('path');
const app = express();
const port = process.env.PORT || 3001;

// Initialize SQLite database
const db = new sqlite3.Database(':memory:');

// Create table for tracking clicks
db.serialize(() => {
    db.run('CREATE TABLE links (id INTEGER PRIMARY KEY, url TEXT, title TEXT, username TEXT, referral TEXT, clicks INTEGER)');
});

// Utility functions for encoding
const doubleBase64Encode = (str) => base64url(base64url(str));
const doubleBase64Decode = (str) => base64url.decode(base64url.decode(str));

// Function to save shortened link to a file
const saveShortenedLink = (id) => {
    const shortenedLink = `http://localhost:${port}/${id}?ref=bm9yZGVyLXNub29yLmNvbQ%3D%3D\n`;
    const filePath = path.join(__dirname, 'shortened_links.txt');
    fs.appendFile(filePath, shortenedLink, (err) => {
        if (err) {
            console.error('Error saving shortened link:', err);
        } else {
            console.log(`Shortened link saved: ${shortenedLink.trim()}`);
        }
    });
};

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Endpoint to create a new short link
app.post('/create', express.json(), (req, res) => {
    const { url, title, username } = req.body;
    if (!url || !title || !username) {
        return res.status(400).send('URL, title, and username are required');
    }
    const encodedUsername = doubleBase64Encode(username);
    const encodedReferral = doubleBase64Encode('office.com');
    db.run('INSERT INTO links (url, title, username, referral, clicks) VALUES (?, ?, ?, ?, 0)', [url, title, encodedUsername, encodedReferral], function(err) {
        if (err) {
            return res.status(500).send('Error creating link');
        }
        const id = this.lastID;
        saveShortenedLink(id); // Save the shortened link to the file
        res.send({ id: id, shortUrl: `http://localhost:${port}/${id}?ref=bm9yZGVyLXNub29yLmNvbQ%3D%3D` });
    });
});

// Function to check if request is from a bot
const isBot = (userAgent) => {
    const bots = [
        'googlebot', 'bingbot', 'yandexbot', 'duckduckbot', 'slurp', 'baiduspider', 'facebot', 'ia_archiver'
    ];
    const agent = userAgent.toLowerCase();
    return bots.some(bot => agent.includes(bot));
};

// Function to log redirect information
const logRedirect = (id, url, userAgent) => {
    const logMessage = `${new Date().toISOString()} - ID: ${id} - URL: ${url} - User-Agent: ${userAgent}\n`;
    const logFilePath = path.join(__dirname, 'redirects.log');
    fs.appendFile(logFilePath, logMessage, (err) => {
        if (err) {
            console.error('Error logging redirect:', err);
        }
    });
};

// Endpoint to redirect and track clicks
app.get('/:id', (req, res) => {
    const id = req.params.id;
    const ref = req.query.ref;
    const userAgent = req.headers['user-agent'];

    if (isBot(userAgent)) {
        return res.status(403).send('Bots are not allowed');
    }

    db.get('SELECT url, clicks FROM links WHERE id = ?', [id], (err, row) => {
        if (err || !row) {
            return res.status(404).send('Link not found');
        }
        const referral = doubleBase64Decode(ref || '');
        if (referral !== 'office.com') {
            return res.status(403).send('Invalid referral');
        }
        db.run('UPDATE links SET clicks = clicks + 1 WHERE id = ?', [id]);
        logRedirect(id, row.url, userAgent); // Log the redirect
        res.redirect(row.url);
    });
});

// Endpoint to get link statistics
app.get('/stats/:id', (req, res) => {
    const id = req.params.id;
    db.get('SELECT url, title, username, referral, clicks FROM links WHERE id = ?', [id], (err, row) => {
        if (err || !row) {
            return res.status(404).send('Link not found');
        }
        row.username = doubleBase64Decode(row.username);
        row.referral = doubleBase64Decode(row.referral);
        res.send(row);
    });
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}/`);
});

// Export the app for vercel
module.exports = app;
