const sgMail = require("@sendgrid/mail");
const { v4: uuidv4 } = require("uuid");

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

function generateVerificationToken() {
  return uuidv4();
}

async function sendVerificationEmail(email, verificationToken) {
  const msg = {
    to: email,
    from: "bieganski1996@gmail.com",
    subject: "Email Verification",
    text: `Please verify your email by clicking the following link: ${process.env.APP_URL}/users/verify/${verificationToken}`,
    html: `<p>Please verify your email by clicking the following link: <a href="${process.env.APP_URL}/users/verify/${verificationToken}">${process.env.APP_URL}/users/verify/${verificationToken}</a></p>`,
  };

  try {
    await sgMail.send(msg);
    console.log("Email sent");
  } catch (error) {
    console.error(error);
    if (error.response) {
      console.error(error.response.body);
    }
  }
}

module.exports = { generateVerificationToken, sendVerificationEmail };