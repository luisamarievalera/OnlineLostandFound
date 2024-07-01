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

function computeLPSArray(pattern) {
  const m = pattern.length;
  const lps = new Array(m).fill(0);
  let len = 0;
  let i = 1;

  while (i < m) {
    if (pattern[i] === pattern[len]) {
      len++;
      lps[i] = len;
      i++;
    } else {
      if (len !== 0) {
        len = lps[len - 1];
      } else {
        lps[i] = 0;
        i++;
      }
    }
  }

  return lps;
}

function searchWithKMP(text, pattern) {
  const n = text.length;
  const m = pattern.length;
  const lps = computeLPSArray(pattern);

  let i = 0;
  let j = 0;

  const foundIndexes = [];

  while (i < n) {
    if (pattern[j] === text[i]) {
      i++;
      j++;
    }

    if (j === m) {
      foundIndexes.push(i - j);
      j = lps[j - 1];
    } else if (i < n && pattern[j] !== text[i]) {
      if (j !== 0) {
        j = lps[j - 1];
      } else {
        i++;
      }
    }
  }

  return foundIndexes;
}

function searchItems(foundItems, lostItems) {
  const foundItemsLower = foundItems.toLowerCase();
  const lostItemsArray = lostItems.toLowerCase().split(',').map(item => item.trim());

  const foundIndexes = [];

  lostItemsArray.forEach(lostItem => {
    const indexes = searchWithKMP(foundItemsLower, lostItem);
    foundIndexes.push(...indexes);
  });

  return foundIndexes;
}

router.get("/", (req, res) => {
  const user = req.session.user;
  res.render("lost", { user: user });
});
  
router.post('/', upload.single('file'), async (req, res) => {
    try {
      const { studentNum, firstName, email, contactNum, location, building, datetime, objTitle, sameAddress, category, description, department } = req.body;
      const status = "Pending";
      const image = req.file;
      const lostItemRef = await db.collection('lost').add({
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
        type: "lost",
        retrieveDate: "",
        retrievedBy: "",
        dataAdded: new Date(),
        image: `/images/${image.filename}`,
        status,
        viewed: false,
        similar: false
      });

      const lostItem = await lostItemRef.get();
      try {
        db.collection('found').get().then(snapshot => {
          const similarItems = [];
          snapshot.forEach(data => {
            const indexes = searchItems(data.data().description, description);
            if (indexes.length > 0) {
                similarItems.push({id: data.id, ...data.data()});
                lostItemRef.update({ viewed: false, similar: true });
            }
          })

          if (similarItems.length > 0) {
            const message = `<p>Your reported item has similar found items.<br>View here: ${`http://localhost:3000/view/similar/found/${lostItem.id}/lost`}</p>`;
  
            const msg = {
              to: email,
              from: 'ti.philippines.edu@gmail.com',
              subject: `Similar Found Items`,
              text: `Your reported item has similar found items.<br>View here: ${`http://localhost:3000/view/similar/found/${lostItem.id}/lost`}`,
              html: message,
            }
            sgMail.send(msg).then(() => {
              console.log("Email sent")
            })
            .catch((error) => {
              console.error(error)
            })

            similarItems.forEach(element => {
              const message = `<p>Your reported item has similar lost items.<br>View here: ${`http://localhost:3000/view/similar/lost/${element.id}/found`}</p>`;
              const msg = {
                to: element.email,
                from: 'ti.philippines.edu@gmail.com',
                subject: `Similar Lost Items`,
                text: `Your reported item has similar lost items.<br>View here: ${`http://localhost:3000/view/similar/lost/${element.id}/found`}`,
                html: message,
              }
              sgMail.send(msg).then(() => {
                console.log("Email sent")
              })
              .catch((error) => {
                console.error(error)
              })
              db.collection('found').doc(element.id).update({viewed: false, similar: true})
            });

            console.log(`http://localhost:3000/view/similar/found/${lostItem.id}/found`);
          }

        }).catch(err => {
          console.log(err);
        })


        const collectionRef = db.collection('users');
        collectionRef.get()
          .then(async (snapshot) => {
            const message = `<p>New lost item has been reported.\nView here: ${`http://localhost:3000/preview/lost/${lostItem.id}`}</p>`;
            snapshot.forEach((doc) => {
              const data = [];
              data.push(doc.data());
              data.forEach((user) => {
                if (req.session.user.email != user.email && (user.email || user.email != "")) {
                  const msg = {
                    to: user.email,
                    from: 'ti.philippines.edu@gmail.com',
                    subject: `Lost Item`,
                    text: `New lost item has been reported.\nView here: ${`http://localhost:3000/preview/lost/${lostItem.id}`}`,
                    html: message,
                  }
                  sgMail.send(msg).then(() => {
                    console.log("Email sent")
                  })
                  .catch((error) => {
                    console.error(error)
                  })
                  console.log(`http://localhost:3000/preview/lost/${lostItem.id}`);
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

      res.redirect(`/preview/lost/${lostItem.id}`);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to create a lost item' });
    }
});

router.put('/:id', upload.single('file'), async (req, res) => {
    try {
      const itemId = req.params.id;
      const { studentNum, firstName, email, contactNum, location, building, datetime, objTitle, sameAddress, category, description, department } = req.body;
      const status = "Pending";
      const image = req.file;
      await db.collection('lost').doc(itemId).update({
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
      res.redirect(`/preview/lost/${itemId}`);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to update the lost item' });
    }
});

module.exports = router;