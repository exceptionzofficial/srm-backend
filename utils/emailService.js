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
            from: `"SRM HR Portal" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: 'Email Verification - SRM HR Portal',
            html: `
                <!DOCTYPE html>
                <html>
                <head>
                    <style>
                        body {
                            font-family: Arial, sans-serif;
                            line-height: 1.6;
                            color: #333;
                        }
                        .container {
                            max-width: 600px;
                            margin: 0 auto;
                            padding: 20px;
                            background-color: #f9f9f9;
                        }
                        .content {
                            background-color: white;
                            padding: 30px;
                            border-radius: 10px;
                            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                        }
                        .header {
                            text-align: center;
                            color: #2563eb;
                            margin-bottom: 30px;
                        }
                        .otp-box {
                            background-color: #f0f7ff;
                            border: 2px dashed #2563eb;
                            border-radius: 8px;
                            padding: 20px;
                            text-align: center;
                            margin: 30px 0;
                        }
                        .otp-code {
                            font-size: 32px;
                            font-weight: bold;
                            color: #2563eb;
                            letter-spacing: 8px;
                            margin: 10px 0;
                        }
                        .warning {
                            background-color: #fff3cd;
                            border-left: 4px solid #ffc107;
                            padding: 15px;
                            margin: 20px 0;
                            border-radius: 4px;
                        }
                        .footer {
                            text-align: center;
                            margin-top: 30px;
                            color: #666;
                            font-size: 14px;
                        }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="content">
                            <div class="header">
                                <h1>🔐 Email Verification</h1>
                                <p>SRM HR Portal</p>
                            </div>
                            
                            <p>Hello <strong>${employeeName}</strong>,</p>
                            
                            <p>We received a request to verify your email address for employee registration in the SRM HR Portal.</p>
                            
                            <div class="otp-box">
                                <p style="margin: 0; color: #666;">Your One-Time Password (OTP) is:</p>
                                <div class="otp-code">${otp}</div>
                                <p style="margin: 0; color: #666; font-size: 14px;">Valid for ${process.env.OTP_EXPIRY_MINUTES || 10} minutes</p>
                            </div>
                            
                            <p>Please enter this OTP in the employee registration form to complete the verification process.</p>
                            
                            <div class="warning">
                                <strong>⚠️ Security Notice:</strong>
                                <ul style="margin: 10px 0; padding-left: 20px;">
                                    <li>Never share this OTP with anyone</li>
                                    <li>SRM staff will never ask for your OTP</li>
                                    <li>This code expires in ${process.env.OTP_EXPIRY_MINUTES || 10} minutes</li>
                                </ul>
                            </div>
                            
                            <p>If you didn't request this verification, please ignore this email or contact your HR administrator.</p>
                            
                            <div class="footer">
                                <p>This is an automated email from SRM HR Portal. Please do not reply.</p>
                                <p>&copy; ${new Date().getFullYear()} SRM. All rights reserved.</p>
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
