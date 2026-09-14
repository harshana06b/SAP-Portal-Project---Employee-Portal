const nodemailer = require('nodemailer');

const DEFAULT_FROM = 'kaartechemp@gmail.com';
const DEFAULT_TO = 'bharshana06@gmail.com';

function getMailConfig() {
    const user = process.env.PAYSLIP_MAIL_FROM || DEFAULT_FROM;
    const pass = process.env.GMAIL_APP_PASSWORD || process.env.GMAIL_PASSWORD;
    const to = process.env.PAYSLIP_MAIL_TO || DEFAULT_TO;

    if (!pass) {
        throw {
            status: 500,
            message: 'Gmail app password is not configured. Set GMAIL_APP_PASSWORD in backend/.env.',
        };
    }

    return { user, pass, to };
}

async function sendPayslipMail({ pdfBuffer, fileName, statement }) {
    const { user, pass, to } = getMailConfig();
    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user, pass },
    });

    const period = [statement.payMonth, statement.payYear].filter(Boolean).join('/');
    const subject = `Payslip - ${statement.payMonth || ''} ${statement.payYear || ''}`.trim();

    return transporter.sendMail({
        from: user,
        to,
        subject,
        text: [
            `Employee: ${statement.employeeName || statement.pernr || 'Employee'}`,
            `Employee ID: ${statement.pernr || 'Not available'}`,
            `Period: ${period || 'Not available'}`,
            '',
            'Please find the payslip PDF attached.',
        ].join('\n'),
        attachments: [
            {
                filename: fileName,
                content: Buffer.from(pdfBuffer),
                contentType: 'application/pdf',
            },
        ],
    });
}

module.exports = {
    sendPayslipMail,
};
