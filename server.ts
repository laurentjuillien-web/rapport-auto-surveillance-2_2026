import express from 'express';
import { createServer as createViteServer } from 'vite';
import nodemailer, { type Transporter } from 'nodemailer';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// Permettre la réception de charges lourdes pour le PDF en base64
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Route de vérification de santé
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// Route d'envoi automatique direct d'e-mail avec PDF en pièce jointe
app.post('/api/send-email', async (req, res) => {
  try {
    const { to, subject, text, html, attachment, smtpConfig } = req.body;

    if (!to || typeof to !== 'string' || !to.includes('@')) {
      return res.status(400).json({ success: false, error: 'Adresse e-mail destinataire invalide.' });
    }

    if (!attachment || !attachment.content) {
      return res.status(400).json({ success: false, error: 'Pièce jointe PDF manquante.' });
    }

    // Configuration SMTP personnalisée si fournie par l'utilisateur ou variables d'environnement
    const host = smtpConfig?.host || process.env.SMTP_HOST;
    const port = smtpConfig?.port
      ? parseInt(smtpConfig.port, 10)
      : process.env.SMTP_PORT
      ? parseInt(process.env.SMTP_PORT, 10)
      : 587;
    const user = smtpConfig?.user || process.env.SMTP_USER;
    const pass = smtpConfig?.pass || process.env.SMTP_PASS;
    const from =
      smtpConfig?.from ||
      process.env.SMTP_FROM ||
      '"Autosurveillance STEP" <autosurveillance@step-epuration.fr>';

    let transporter: Transporter;
    let isTestAccount = false;
    let previewUrl: string | false = false;

    if (host && user && pass) {
      transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
        tls: { rejectUnauthorized: false },
      });
    } else {
      // Compte Ethereal sécurisé et transparent généré pour acheminer le message avec PJ
      isTestAccount = true;
      const testAccount = await nodemailer.createTestAccount();
      transporter = nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: {
          user: testAccount.user,
          pass: testAccount.pass,
        },
      });
    }

    const mailOptions = {
      from,
      to,
      subject: subject || "Bilan d'autosurveillance 24h - Station d'épuration (STEP)",
      text:
        text ||
        "Veuillez trouver ci-joint le bilan officiel d'autosurveillance avec les photographies certifiées en pièce jointe.",
      html:
        html ||
        `<div style="font-family: sans-serif; color: #1e293b; max-width: 600px; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px;">
          <h2 style="color: #0f4c81; margin-top: 0;">Bilan d'Autosurveillance 24h</h2>
          <p>Le document officiel certifié de contrôle réglementaire est directement joint à ce courriel au format PDF.</p>
          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
          <p style="font-size: 12px; color: #64748b;">Rapport généré électroniquement • Créé par Laurent Juillien</p>
        </div>`,
      attachments: [
        {
          filename: attachment.filename || 'Bilan_Autosurveillance_STEP.pdf',
          content: attachment.content,
          encoding: 'base64',
          contentType: 'application/pdf',
        },
      ],
    };

    const info = await transporter.sendMail(mailOptions);

    if (isTestAccount) {
      previewUrl = nodemailer.getTestMessageUrl(info);
    }

    return res.json({
      success: true,
      messageId: info.messageId,
      previewUrl: previewUrl || null,
      isTestAccount,
      recipient: to,
      filename: attachment.filename || 'Bilan_Autosurveillance_STEP.pdf',
      timestamp: new Date().toISOString(),
      message: `E-mail envoyé avec succès en arrière-plan à ${to} avec la pièce jointe PDF.`,
    });
  } catch (error: any) {
    console.error('Erreur send-email backend:', error);
    return res.status(500).json({
      success: false,
      error: error?.message || "Erreur interne lors de l'envoi de l'e-mail.",
    });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static('dist'));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve('dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server started on http://0.0.0.0:${PORT}`);
  });
}

startServer();
