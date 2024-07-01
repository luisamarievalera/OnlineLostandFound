const express = require("express");
const path = require("path");
const router = express.Router();
const admin = require("firebase-admin");
const multer = require('multer');
const db = admin.firestore()
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

router.get("/", (req, res) => {
  const user = req.session.user;
  if (typeof user == "undefined" || user.role != "User") {
      try {
          res.redirect("/login");
      } catch (error) {
          
      }
  }
  res.render("found", { user: user });
});
  
router.post('/', upload.single('file'), async (req, res) => {
    try {
      const { studentNum, firstName, email, contactNum, location, building, datetime, objTitle, sameAddress, category, description, department } = req.body;
      const status = "Pending";
      const image = req.file;
      const foundItemRef = await db.collection('found').add({
        studentNum,
        firstName,
        email,
        contactNum,
        location,
        building, 
        datetime, 
        objTitle, 
        sameAddress: sameAddress ? true:false,
        category,
        description,
        department,
        type: "found",
        retrieveDate: "",
        retrievedBy: "",
        dataAdded: new Date(),
        image: `/images/${image.filename}`,
        status,
        viewed: false,
        similar: false
      });
      const foundItem = await foundItemRef.get();

      try {

        db.collection('lost').get().then(snapshot => {
          const similarItems = [];
          snapshot.forEach(data => {
            const indexes = searchItems(data.data().description, description);
            if (indexes.length > 0) {
                similarItems.push({id: data.id, ...data.data()});
                lostItemRef.update({ viewed: false, similar: true });
            }
          })

          if (similarItems.length > 0) {
            const message = `<p>Your reported item has similar lost items.<br>View here: ${`http://localhost:3000/view/similar/lost/${lostItem.id}/found`}</p>`;
  
            const msg = {
              to: email,
              from: 'ti.philippines.edu@gmail.com',
              subject: `Similar Lost Items`,
              text: `Your reported item has similar lost items.<br>View here: ${`http://localhost:3000/view/similar/lost/${lostItem.id}/found`}`,
              html: message,
            }
            sgMail.send(msg).then(() => {
              console.log("Email sent")
            })
            .catch((error) => {
              console.error(error)
            })

            similarItems.forEach(element => {
              const message = `<p>Your reported item has similar found items.<br>View here: ${`http://localhost:3000/view/similar/lost/${element.id}/lost`}</p>`;
              const msg = {
                to: element.email,
                from: 'ti.philippines.edu@gmail.com',
                subject: `Similar Found Items`,
                text: `Your reported item has similar found items.<br>View here: ${`http://localhost:3000/view/similar/lost/${element.id}/lost`}`,
                html: message,
              }
              sgMail.send(msg).then(() => {
                console.log("Email sent")
              })
              .catch((error) => {
                console.error(error)
              })
              db.collection('lost').doc(element.id).update({viewed: false, similar: true})
            });

            console.log(`http://localhost:3000/view/similar/lost/${lostItem.id}/lost`);
          }

        }).catch(err => {
          console.log(err);
        })

        const collectionRef = db.collection('users');
        collectionRef.get()
          .then(async (snapshot) => {
            const message = `<p>New found item has been reported.\nView here: ${`http://localhost:3000/preview/found/${foundItem.id}`}</p>`;
            snapshot.forEach((doc) => {
              const data = [];
              data.push(doc.data());
              data.forEach((user) => {
                if (req.session.user.email != user.email && (user.email || user.email != "")) {
                  const msg = {
                    to: user.email,
                    from: 'ti.philippines.edu@gmail.com',
                    subject: `Found Item`,
                    text: `New found item has been reported.\nView here: ${`http://localhost:3000/preview/found/${foundItem.id}`}`,
                    html: message,
                  }
                  sgMail.send(msg).then(() => {
                    console.log("Email sent")
                  })
                  .catch((error) => {
                    console.error(error)
                  })
                  console.log(`http://localhost:3000/preview/found/${foundItem.id}`);
                }
              })
            });
        })
        .catch((error) => {
            console.error('Error fetching data:', error);
        });
      } catch (error) {
        res.status(500).send(error.message);
      }

      res.redirect(`/preview/found/${foundItem.id}`);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to create a found item' });
    }
});

router.put('/:id', upload.single('file'), async (req, res) => {
    try {
      const itemId = req.params.id;
      const { studentNum, firstName, email, contactNum, location, building, datetime, objTitle, sameAddress, category, description, department } = req.body;
      const status = "Pending";
      const image = req.file;
      await db.collection('found').doc(itemId).update({
        studentNum,
        firstName,
        email,
        contactNum,
        location,
        building, 
        datetime, 
        objTitle, 
        sameAddress: sameAddress ? true:false,
        category,
        description,
        department,
        retrieveDate: "",
        retrievedBy: "",
        image: `/images/${image.filename}`,
        status,
      });
      res.redirect(`/preview/found/${itemId}`);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to update the found item' });
    }
});

router.delete('/:id', async (req, res) => {
    try {
      const itemId = req.params.id;
      
      await db.collection('found').doc(itemId).delete();
  
      res.status(200).json({ message: 'found item deleted successfully' });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to delete the found item' });
    }
});

module.exports = router;