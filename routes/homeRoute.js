const express = require("express");
const path = require("path");
const router = express.Router();
const admin = require("firebase-admin");
const db = admin.firestore();

router.get("/", async (req, res) => {
    const user = req.session.user;
    if (typeof user == "undefined" || user.role != "User") {
        try {
            res.redirect("/login");
        } catch (error) {
            
        }
    }
    const notificationRef = db.collection('announcement').orderBy("date", "desc");
    const lostRef = db.collection('lost');
    const data = [];
    const notification = [];
    const notificationNotif = [];
    const viewed = [];

    await lostRef.get()
    .then((snapshot) => {
        db.collection('found').get().then((found) => {
            
            snapshot.forEach((doc) => {
                data.push({ id: doc.id, ...doc.data() });
            });
            found.forEach((doc) => {
                data.push({ id: doc.id, ...doc.data() });
            });
            data.sort((a, b) => {
                let da = new Date(a.dataAdded.toDate()),
                    db = new Date(b.dataAdded.toDate());
                return db - da;
            });
            
            notificationRef.get().then((notif) => {
                notif.forEach((doc) => {
                    // console.log(doc);
                    var message = doc.data().thoughts;
                    var subject = doc.data().subject;
                    var image = doc.data().image;
                    
                    notification.push({ id: doc.id, message: message, ...doc.data() });
                    if (doc.data.status != "Archived") {
                        notificationNotif.push({id: doc.id, message: message.substring(0, 35)+"...", loc: `/announcementView`, date: doc.data().date});
                    }
                });
            });
            notificationRef.get().then((notif) => {
                notif.forEach((doc) => {
                    // console.log(doc);
                    var notifs = doc.data();
                    if (typeof notifs.viewedBy == "undefined" || (typeof user != "undefined" && !notifs.viewedBy.includes(user.name))) {
                        viewed.push(doc.id);
                        db.collection('announcement').doc(doc.id).update({ viewedBy: (typeof user != "undefined" ? [user.name, ...notifs.viewedBy] : [user.name]) });
                    }
                });

                db.collection('appointment').where("email", "==", (typeof user != "undefined" ? user.email : "")).get().then((appoint) => {
                    var viewedAppointment = [];
                    var viewedAppointmentNotif = [];
                    appoint.forEach((doc) => {
                        viewedAppointment.push({id: doc.id, ...doc.data()});
                        if (typeof viewedAppointment.viewed == "undefined" || (typeof viewedAppointment.viewed != "undefined" && !viewedAppointment.viewed)) {
                            db.collection('appointment').doc(`${doc.id}`).update({ viewed: true });
                        }
                        viewedAppointmentNotif.push({id: doc.id, message: `Your appointment is ${doc.data().status}. Click for more details.`, loc: `/appointmentView/${doc.id}`, date: doc.data().date});
                    });
                    const ed = new Date("2016-08-21T00:00:00.000Z").getTime()
                    const sd = new Date("2010-08-21T00:00:00.000Z").getTime()
                    const appointJoin = notification.concat(viewedAppointment).filter(data =>{
                        return typeof data.date != "string"
                    }).sort((a, b) => {
                        return (new Date(b.date.toMillis()).getTime() - new Date(a.date.toMillis()).getTime());
                    });
                    db.collection('lost').where("email", "==", (typeof user != "undefined" ? user.email : "")).get().then((lost) => {
                        var viewedLost = [];
                        var viewedLostNotif = [];
                        lost.forEach((doc) => {
                            if (doc.data().similar) {
                                viewedLost.push({id: doc.id, ...doc.data()});
                                if (typeof viewedLost.viewed == "undefined" || (typeof viewedLost.viewed != "undefined" && !viewedLost.viewed)) {
                                    db.collection('lost').doc(`${doc.id}`).update({ viewed: true });
                                }
                                viewedLostNotif.push({id: doc.id, message: "Your reported item has similar items. Click for more details.", loc: `/view/similar/found/${doc.id}/lost`, date: doc.data().dataAdded});
                            }
                        });
                        viewedLostNotif = viewedLostNotif.concat(viewedAppointmentNotif);
                        db.collection('found').where("email", "==", (typeof user != "undefined" ? user.email : "")).get().then((found) => {
                            var viewedFound = [];
                            var viewedFoundNotif = [];
                            found.forEach((doc) => {
                                if (doc.data().similar) {
                                    viewedFound.push({id: doc.id, ...doc.data(), notifType: "Similar"});
                                    if (typeof viewedFound.viewed == "undefined" || (typeof viewedFound.viewed != "undefined" && !viewedFound.viewed)) {
                                        db.collection('found').doc(`${doc.id}`).update({ viewed: true });
                                    }
                                    viewedFoundNotif.push({id: doc.id, message: "Your reported item has similar items. Click for more details.", loc: `/view/similar/lost/${doc.id}/found`, date: doc.data().dataAdded});
                                }
                                if (doc.data().status == "Claimed") {
                                    viewedFound.push({id: doc.id, ...doc.data(), notifType: "Claim"});
                                    if (typeof viewedFound.viewed == "undefined" || (typeof viewedFound.viewed != "undefined" && !viewedFound.viewed)) {
                                        db.collection('found').doc(`${doc.id}`).update({ viewed: true });
                                    }
                                    viewedFoundNotif.push({id: doc.id, message: `Your reported item "${doc.data().objTitle}" has been claimed.`, loc: `/preview/found/${doc.id}`, date: doc.data().dataAdded});
                                }
                            });
                            viewedFoundNotif = viewedFoundNotif.concat(viewedLostNotif);
                            db.collection('lost').where("similar", "==", false).get().then((lost) => {
                                var fetchLost = [];
                                var fetchLostNotif = [];
                                lost.forEach((doc) => {
                                    if (typeof req.session.user != "undefined" && req.session.user.email != doc.data().email) {
                                        fetchLost.push({id: doc.id, ...doc.data(), loc: "lost"});
                                        fetchLostNotif.push({id: doc.id, message: "New lost item has been reported.", loc: `/preview/lost/${doc.id}`, date: doc.data().dataAdded});
                                    }
                                })
                                fetchLostNotif = fetchLostNotif.concat(viewedFoundNotif);
                                db.collection('found').where("similar", "==", false).get().then((found) => {
                                    var fetchFound = [];
                                    var fetchFoundNotif = []
                                    found.forEach((doc) => {
                                        if (typeof req.session.user != "undefined" && req.session.user.email != doc.data().email) {
                                            fetchFound.push({id: doc.id, ...doc.data(), loc: "found"});
                                            fetchFoundNotif.push({id: doc.id, message: "New found item has been reported.", loc: `/preview/found/${doc.id}`, date: doc.data().dataAdded});
                                        }
                                    })
                                    const notifJoined = fetchLostNotif.concat(fetchFoundNotif);
                                    const successMessage = `Welcome! You have successfully logged in. You have ${notifJoined.length} notifications.`;
                                    res.render('home', { user: user, data: data, notification: notification, viewed: viewed, appointment: viewedAppointment, notifJoined: notifJoined, lost: viewedLost, found: viewedFound, fetchLost, fetchFound, successMessage, notificationNotif  }, );
                                })
                            })
                        });
                    })
                })
            });
        })
    })
    .catch((error) => {
        console.error('Error fetching data:', error);
    });

});
module.exports = router;
