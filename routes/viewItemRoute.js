const express = require("express");
const path = require("path");
const router = express.Router();
const admin = require("firebase-admin");
const db = admin.firestore();
const multer = require('multer');

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

function calculateSimilarityPercentage(foundItem, lostItem) {
  const foundLength = foundItem.length;
  const lostLength = lostItem.length;
  const commonIndexes = searchWithKMP(foundItem, lostItem);

  // Ensure common indexes are within the bounds of both foundItem and lostItem
  const validIndexes = commonIndexes.filter(index => index <= foundLength - 1 && index <= lostLength - 1);

  const commonLength = validIndexes.reduce((sum, index) => {
      const remainingLength = lostLength - index;
      return sum + (remainingLength > 0 ? remainingLength : 0);
  }, 0);

  return (commonLength / foundLength) * 100;
}

function searchItems(foundItems, lostItems) {
  const replaceSpecialChars = (str) => str.replace(/[^a-zA-Z0-9\s]/g, ''); // Replace non-alphanumeric characters with spaces

  const foundItemsLower = replaceSpecialChars(foundItems.toLowerCase());
  const lostItemsArray = replaceSpecialChars(lostItems.toLowerCase()).split(' ').map(item => item.trim());

  // Use a reducer to accumulate the similarity percentages
  const { similaritySum, foundIndexes } = lostItemsArray.reduce(
      (accumulator, lostItem) => {
          const indexes = searchWithKMP(foundItemsLower, lostItem);
          accumulator.foundIndexes.push(...indexes);

          // Calculate similarity percentage and add to the sum
          const similarityPercentage = calculateSimilarityPercentage(foundItemsLower, lostItem);
          accumulator.similaritySum += similarityPercentage;

          return accumulator;
      },
      { similaritySum: 0, foundIndexes: [] }
  );

  // Check if there is no similarity
  if (foundIndexes.length === 0) {
      return { similarity: 0, foundIndexes: [] };
  }

  // Calculate the overall similarity percentage
  const overallSimilarity = similaritySum / foundIndexes.length;

  return { similarity: overallSimilarity, foundIndexes: foundIndexes };
}

router.get("/lost/:id", (req, res) => {
    const user = req.session.user;
    if (typeof user == "undefined" || user.role != "User") {
        try {
            res.redirect("/login");
        } catch (error) {
            
        }
    }
    // Fetch data from a Firestore collection
    const collectionRef = db.collection('lost').doc(req.params.id);
    collectionRef.get()
    .then((snapshot) => {
        res.render('viewItem', { data: snapshot.data(), id: snapshot.id, location: "lost", user: req.session.user });
    })
    .catch((error) => {
        console.error('Error fetching data:', error);
    });
});

router.get("/found/:id", (req, res) => {
    const user = req.session.user;
    if (typeof user == "undefined" || user.role != "User") {
        try {
            res.redirect("/login");
        } catch (error) {
            
        }
    }
    // Fetch data from a Firestore collection
    const collectionRef = db.collection('found').doc(req.params.id);
    collectionRef.get()
    .then((snapshot) => {
        res.render('viewItem', { data: snapshot.data(), id: snapshot.id, location: "found", user: req.session.user });
    })
    .catch((error) => {
        console.error('Error fetching data:', error);
    });
});

router.get("/similar/lost/:id/:type", (req, res) => {
    const id = req.params.id;
    const type = req.params.type;
    const collectionRef = db.collection(type).doc(id);
    try {
      collectionRef.get()
      .then((snapshot) => {
          const similarItems = [];
          db.collection('lost').get().then((doc) => {
              doc.forEach(data => {
                  const  { similarity, foundIndexes } = searchItems(data.data().description, snapshot.data().description);
                  similarItems.push({...data.data(), similarity});
                  if (foundIndexes.length > 0 && snapshot.id != data.id) {
                      console.log(similarity)
                  }
              })
              res.render('similarItems', { item: snapshot.data(), similarItems, id: snapshot.id, location: "Lost", user: req.session.user });
          })
      })
      .catch((error) => {
          console.error('Error fetching data:', error);
      });
    } catch (error) {
      console.log(error)
    }
});

router.get("/similar/found/:id/:type", (req, res) => {
    const id = req.params.id;
    const type = req.params.type;
    const collectionRef = db.collection(type).doc(id);
    collectionRef.get()
    .then((snapshot) => {
        const similarItems = [];
        db.collection('found').get().then((doc) => {
          doc.forEach(data => {
              const  { similarity, foundIndexes } = searchItems(data.data().description, snapshot.data().description);
              if (foundIndexes.length > 0 && snapshot.id != data.id && similarity > 0) {
                similarItems.push({...data.data(), similarity});
              }
          })
            res.render('similarItems', { item: snapshot.data(), similarItems, id: snapshot.id, location: "Found", user: req.session.user });
        })
    })
    .catch((error) => {
        console.error('Error fetching data:', error);
    });
});

module.exports = router;