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
                    <style>
                        body {
                            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                            line-height: 1.6;
                            color: #333;
                            margin: 0;
                            padding: 0;
                        }
                        .container {
                            max-width: 600px;
                            margin: 0 auto;
                            padding: 20px;
                            background-color: #f5f5f5;
                        }
                        .content {
                            background-color: white;
                            padding: 40px 30px;
                            border-radius: 12px;
                            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
                        }
                        .logo {
                            text-align: center;
                            margin-bottom: 20px;
                        }
                        .logo img {
                            max-width: 200px;
                            height: auto;
                        }
                        .header {
                            text-align: center;
                            margin-bottom: 30px;
                            border-bottom: 3px solid #2563eb;
                            padding-bottom: 20px;
                        }
                        .header h1 {
                            color: #1e40af;
                            margin: 0 0 10px 0;
                            font-size: 24px;
                        }
                        .header p {
                            color: #64748b;
                            margin: 0;
                            font-size: 14px;
                        }
                        .otp-box {
                            background: linear-gradient(135deg, #f0f7ff 0%, #e0f2fe 100%);
                            border: 2px dashed #2563eb;
                            border-radius: 10px;
                            padding: 25px;
                            text-align: center;
                            margin: 30px 0;
                        }
                        .otp-code {
                            font-size: 36px;
                            font-weight: bold;
                            color: #1e40af;
                            letter-spacing: 10px;
                            margin: 15px 0;
                            font-family: 'Courier New', monospace;
                        }
                        .warning {
                            background-color: #fffbeb;
                            border-left: 4px solid #f59e0b;
                            padding: 15px 20px;
                            margin: 25px 0;
                            border-radius: 6px;
                        }
                        .warning strong {
                            color: #d97706;
                        }
                        .footer {
                            text-align: center;
                            margin-top: 30px;
                            padding-top: 20px;
                            border-top: 1px solid #e5e7eb;
                            color: #6b7280;
                            font-size: 13px;
                        }
                        ul {
                            margin: 10px 0;
                            padding-left: 20px;
                        }
                        li {
                            margin: 5px 0;
                        }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="content">
                            <div class="logo">
                                <img src="https://srm-logo.s3.us-east-1.amazonaws.com/srm-logo.png" alt="SRM Sweets Logo" />
                            </div>
                            <div class="header">
                                <h1>🔐 Email Verification Required</h1>
                                <p>SRM Sweets - Employee Management System</p>
                            </div>
                            
                            <p>Dear <strong>${employeeName}</strong>,</p>
                            
                            <p>You are being added as an employee in our system. To complete your registration, please verify your email address using the One-Time Password (OTP) below.</p>
                            
                            <div class="otp-box">
                                <p style="margin: 0; color: #64748b; font-size: 14px;">Your One-Time Password:</p>
                                <div class="otp-code">${otp}</div>
                                <p style="margin: 0; color: #64748b; font-size: 13px;">⏱️ Valid for ${process.env.OTP_EXPIRY_MINUTES || 10} minutes</p>
                            </div>
                            
                            <p>Please enter this OTP in the registration form to verify your email and complete your employee profile setup.</p>
                            
                            <div class="warning">
                                <strong>⚠️ Security Reminder:</strong>
                                <ul style="margin: 10px 0; padding-left: 20px;">
                                    <li><strong>Do not share</strong> this OTP with anyone, including staff members</li>
                                    <li>This code will <strong>expire in ${process.env.OTP_EXPIRY_MINUTES || 10} minutes</strong></li>
                                    <li>Our staff will <strong>never ask</strong> for your OTP</li>
                                </ul>
                            </div>
                            
                            <p style="color: #6b7280; font-size: 14px;">If you didn't expect this email, please ignore it or contact your HR administrator immediately.</p>
                            
                            <div class="footer">
                                <p style="margin: 5px 0;">This is an automated email. Please do not reply to this message.</p>
                                <p style="margin: 5px 0;">&copy; ${new Date().getFullYear()} SRM Sweets. All rights reserved.</p>
                            </div>
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
    verifyEmailConfig,
};
