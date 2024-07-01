const express = require("express");
const path = require("path");
const router = express.Router();
const admin = require("firebase-admin");
const db = admin.firestore();
const multer = require('multer');
const sgMail = require('@sendgrid/mail')
require('dotenv').config();
sgMail.setApiKey(process.env.SENDGRID_KEY);

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, 'images'); // create an image folder
    },
    filename: function (req, file, cb) {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
      cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    },
  });

const upload = multer({ storage: storage });

router.get("/:location/:id", (req, res) => {
    const user = req.session.user;
    if (typeof user == "undefined" || user.role != "Admin") {
        try {
            res.redirect("/login");
        } catch (error) {
            
        }
    }
    const loggedInUserName = user.firstName;

    const location = req.params.location; 
    if (location === "lost" || location === "found") {
        const collectionRef = db.collection(location).doc(req.params.id);
        collectionRef.get()
        .then((snapshot) => {
            if (snapshot.exists) {
                res.render('admin/admin-retrieveItem', { data: snapshot.data(), id: req.params.id, location: location, releasor: loggedInUserName, user: typeof req.session.user != "undefined" ? req.session.user : "" });
            } else {
                res.status(404).send("Item not found");
            }
        })
        .catch((error) => {
            console.error('Error fetching data:', error);
            res.status(500).send("Error fetching data");
        });
    } else {
        res.status(400).send("Invalid location parameter");
    }
});


router.post('/:location/retrieve/:id', upload.single('file'), async (req, res) => {
    try {
        const location = req.params.location; 
        if (location === "lost" || location === "found") {
            const itemId = req.params.id;
            const { studentNum, firstName, email, contactNum, datetime, objTitle, sameAddress, category, description, department, retrievedBy, retrievedByStudentNum, releasor, prevImage } = req.body;
            const image = req.file;
            const retrieveDate = new Date().toLocaleString();
            const status = retrievedBy ? 'Claimed' : 'Pending';
            
            const dataToUpdate = {
                studentNum,
                firstName,
                email,
                contactNum,
                datetime, 
                objTitle, 
                sameAddress: sameAddress ? "true" : "false",
                category,
                description, 
                department,
                releasor,
                retrievedBy,
                retrievedByStudentNum,
                retrieveDate,
                image: `${image ? '/images/' + image.filename : prevImage}`,
                status: "Claimed",
            };
            
            const collectionRef = db.collection(location).doc(itemId);

            await collectionRef.update(dataToUpdate);
            const message = `<p>Your reported item "${objTitle}" has has been claimed.</p>`;
  
            const msg = {
              to: email,
              from: 'ti.philippines.edu@gmail.com',
              subject: `Items Claimed`,
              text: `Your reported item "${objTitle}" has has been claimed.`,
              html: message,
            }
            sgMail.send(msg).then(() => {
              console.log("Email sent")
            })
            .catch((error) => {
              console.error(error.response.body.errors)
            })

            res.redirect('/admin-view/' + location + '/' + itemId);
        } else {
            res.status(400).json({ error: 'Invalid location parameter' });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to update the item' });
    }
});

module.exports = router;