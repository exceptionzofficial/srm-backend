const nodemailer = require('nodemailer');

// Create reusable transporter object using Gmail SMTP
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD,
    },
});

/**
 * Send OTP email to the specified email address
 * @param {string} email - Recipient email address
 * @param {string} otp - 6-digit OTP
 * @param {string} employeeName - Name of the employee (optional)
 */
async function sendOTPEmail({ email, otp, employeeName = 'Employee' }) {
    try {
        const mailOptions = {
            from: `"SRM Sweets - Employee Management" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: 'Email Verification - Employee Registration',
            html: `
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="utf-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <style>
                        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #1a1a1a; margin: 0; padding: 0; background-color: #f4f4f5; }
                        .container { max-width: 600px; margin: 40px auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.08); font-size: 16px; }
                        .header { background: white; padding: 30px 0 20px 0; text-align: center; border-bottom: 4px solid #EF4136; }
                        .logo-img { height: 70px; width: auto; display: block; margin: 0 auto; }
                        .content { padding: 40px 40px 20px 40px; }
                        .h1-title { color: #111827; margin: 0 0 24px 0; font-size: 26px; font-weight: 700; text-align: center; }
                        .intro-text { margin-bottom: 30px; color: #4b5563; font-size: 16px; line-height: 1.6; text-align: center; }
                        .otp-box { background: #fdf2f2; border: 2px dashed #EF4136; border-radius: 12px; padding: 30px; text-align: center; margin: 30px 0; position: relative; }
                        .otp-label { font-size: 14px; text-transform: uppercase; color: #ef4444; letter-spacing: 1px; font-weight: 700; margin-bottom: 10px; display: block; }
                        .otp-code { font-size: 42px; font-weight: 800; color: #b91c1c; letter-spacing: 8px;font-family: 'Courier New', monospace; margin: 10px 0; text-shadow: 1px 1px 0px rgba(0,0,0,0.1); }
                        .expiry-text { font-size: 13px; color: #7f1d1d; display: flex; align-items: center; justify-content: center; gap: 6px; font-weight: 500; }
                        .warning-box { background-color: #fffbeb; border-left: 4px solid #f59e0b; padding: 16px 20px; margin: 30px 0; border-radius: 4px; font-size: 14px; color: #b45309; }
                        .warning-title { font-weight: 700; color: #92400e; display: block; margin-bottom: 5px; }
                        .footer { background-color: #f9fafb; padding: 24px; text-align: center; color: #9ca3af; font-size: 13px; border-top: 1px solid #e5e7eb; }
                        @media only screen and (max-width: 600px) {
                            .container { padding: 0; margin: 0; width: 100% !important; border-radius: 0; }
                            .content { padding: 30px 20px; }
                            .otp-code { font-size: 32px; letter-spacing: 4px; }
                        }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="header">
                            <img src="https://srm-logo.s3.us-east-1.amazonaws.com/srm-logo.png" alt="SRM Sweets" class="logo-img" />
                        </div>
                        <div class="content">
                            <h1 class="h1-title">Verify Your Email 🔐</h1>
                            
                            <p class="intro-text">Dear <strong>${employeeName}</strong>,<br/>Please use the verification code below to complete your employee registration.</p>
                            
                            <div class="otp-box">
                                <span class="otp-label">Verification Code</span>
                                <div class="otp-code">${otp}</div>
                                <div class="expiry-text">
                                    <span>⏱️</span> Valid for ${process.env.OTP_EXPIRY_MINUTES || 10} minutes
                                </div>
                            </div>
                            
                            <div class="warning-box">
                                <span class="warning-title">⚠️ Security Notice</span>
                                This code is for your registration only. Please do not share it with anyone. Our staff will never ask for this code.
                            </div>
                            
                            <p style="color: #6b7280; font-size: 14px; text-align: center; margin-top: 30px;">
                                If you did not request this verification, please ignore this email.
                            </p>
                        </div>
                        <div class="footer">
                            <p style="margin: 5px 0;">&copy; ${new Date().getFullYear()} SRM Sweets & Cakes. All rights reserved.</p>
                            <p style="margin: 5px 0;">This is an automated system message.</p>
                        </div>
                    </div>
                </body>
                </html>
            `,
        };

        const info = await transporter.sendMail(mailOptions);
        console.log('OTP email sent successfully:', info.messageId);
        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error('Error sending OTP email:', error);
        throw new Error('Failed to send OTP email');
    }
}

/**
 * Send Welcome email with credentials
 * @param {string} email - Recipient email address
 * @param {string} name - Employee Name
 * @param {string} employeeId - Employee ID
 * @param {string} password - Password (if applicable)
 * @param {string} role - Employee Role
 */
async function sendWelcomeEmail({ email, name, employeeId, password, role }) {
    console.log(`[EmailService] Attempting to send Welcome Email to: ${email} for ID: ${employeeId}`);
    try {
        const mailOptions = {
            from: `"SRM Sweets - Employee Management" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: 'Welcome to SRM Sweets - Account Details',
            html: `
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="utf-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <style>
                        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #1a1a1a; margin: 0; padding: 0; background-color: #f4f4f5; }
                        .container { max-width: 600px; margin: 40px auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.08); font-size: 16px; }
                        .header { background: white; padding: 30px 0 20px 0; text-align: center; border-bottom: 4px solid #EF4136; }
                        .logo-img { height: 70px; width: auto; display: block; margin: 0 auto; }
                        .content { padding: 40px 40px 20px 40px; }
                        .h1-title { color: #111827; margin: 0 0 24px 0; font-size: 26px; font-weight: 700; text-align: center; }
                        .welcome-text { margin-bottom: 24px; color: #4b5563; font-size: 16px; line-height: 1.6; }
                        .details-box { background: #f8fafc; padding: 30px; border-radius: 12px; margin: 30px 0; border: 1px solid #e2e8f0; }
                        .label { font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: 1.2px; font-weight: 700; margin-bottom: 6px; }
                        .value { font-size: 17px; font-weight: 600; color: #0f172a; margin-bottom: 22px; border-bottom: 1px solid #e2e8f0; padding-bottom: 10px; }
                        .value:last-child { margin-bottom: 0; border-bottom: none; padding-bottom: 0; }
                        .password-box { background: #fee2e2; border: 1px dashed #ef4444; padding: 10px 16px; border-radius: 6px; font-family: 'Courier New', monospace; letter-spacing: 1px; color: #b91c1c; display: inline-block; font-weight: 700; font-size: 18px; }
                        .footer { background-color: #f9fafb; padding: 24px; text-align: center; color: #9ca3af; font-size: 13px; border-top: 1px solid #e5e7eb; }
                        .btn-login { display: inline-block; background-color: #EF4136; color: white !important; padding: 16px 40px; border-radius: 50px; text-decoration: none; font-weight: 700; margin-top: 10px; font-size: 16px; box-shadow: 0 10px 15px -3px rgba(239, 65, 54, 0.3); transition: all 0.2s; letter-spacing: 0.5px; }
                        .btn-login:hover { background-color: #dc2626; transform: translateY(-2px); box-shadow: 0 20px 25px -5px rgba(239, 65, 54, 0.4); }
                        @media only screen and (max-width: 600px) {
                            .container { padding: 0; margin: 0; width: 100% !important; border-radius: 0; }
                            .content { padding: 30px 20px; }
                        }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="header">
                            <img src="https://srm-logo.s3.us-east-1.amazonaws.com/srm-logo.png" alt="SRM Sweets" class="logo-img" />
                        </div>
                        <div class="content">
                            <h1 class="h1-title">Welcome to the Team! 👋</h1>
                            
                            <p class="welcome-text">Dear <strong>${name}</strong>,</p>
                            
                            <p class="welcome-text">We are thrilled to enable your manager account. You can now access the <strong>SRM Portal</strong> to oversee your branch operations and team performance.</p>
                            
                            <div class="details-box">
                                <div class="label">Assigned Role</div>
                                <div class="value">${role.replace('_', ' ')}</div>
                                
                                <div class="label">Username / Employee ID</div>
                                <div class="value">${employeeId}</div>
                                
                                <div class="label">Temporary Password</div>
                                <div class="value" style="border:none; padding:0; margin:0;"><span class="password-box">${password}</span></div>
                            </div>
                            
                            <p class="welcome-text" style="text-align: center; margin-bottom: 30px;">
                                Please log in immediately and change your password.
                            </p>
                            
                            <div style="text-align: center; margin-bottom: 20px;">
                                <a href="${process.env.FRONTEND_URL || 'https://srm-sweets-admin.web.app'}" class="btn-login">Access Portal</a>
                            </div>

                             <p style="margin-top: 40px; color: #9ca3af; font-size: 14px; text-align: center;">Best Regards,<br/><strong>SRM Admin Team</strong></p>
                        </div>
                        <div class="footer">
                            <p style="margin: 5px 0;">&copy; ${new Date().getFullYear()} SRM Sweets & Cakes. All rights reserved.</p>
                            <p style="margin: 5px 0;">This is an automated system message. Please do not reply.</p>
                        </div>
                    </div>
                </body>
                </html>
            `,
        };

        const info = await transporter.sendMail(mailOptions);
        console.log('Welcome email sent successfully:', info.messageId);
        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error('Error sending welcome email:', error);
        // Don't throw, just log, so we don't fail the API call if email fails
        return { success: false, error: error.message };
    }
}

/**
 * Verify email configuration
 */
async function verifyEmailConfig() {
    try {
        await transporter.verify();
        console.log('Email service is ready to send emails');
        return true;
    } catch (error) {
        console.error('Email service configuration error:', error);
        return false;
    }
}

module.exports = {
    sendOTPEmail,
    sendWelcomeEmail,
    verifyEmailConfig,
};
