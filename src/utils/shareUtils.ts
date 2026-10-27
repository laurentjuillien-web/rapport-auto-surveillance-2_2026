/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { AutosurveillanceData } from '../types';

/**
 * Génère un texte de synthèse clair et professionnel du bilan 24h,
 * parfaitement optimisé pour WhatsApp, SMS et e-mail.
 */
export function generateReportSummary(data: AutosurveillanceData, fileName?: string): string {
  const hasBothDebits =
    data.entreeDebit &&
    data.sortieDebit &&
    !isNaN(Number(data.entreeDebit)) &&
    !isNaN(Number(data.sortieDebit)) &&
    Number(data.entreeDebit) > 0;

  const ratio = hasBothDebits
    ? ((Number(data.sortieDebit) / Number(data.entreeDebit)) * 100).toFixed(1)
    : null;
  const delta = hasBothDebits
    ? (Number(data.sortieDebit) - Number(data.entreeDebit)).toFixed(1)
    : null;

  const lines: string[] = [
    `📋 *BILAN D'AUTOSURVEILLANCE STEP 24H*`,
    `--------------------------------------`,
    `🏢 *Station* : ${data.nomStep || 'Non précisée'}`,
    `📅 *Date du bilan* : ${data.dateAutosurveillance || 'Non précisée'}`,
  ];

  if (data.technicienNom) {
    lines.push(`👷 *Technicien* : ${data.technicienNom}`);
  }
  if (data.meteo) {
    lines.push(`⛅ *Météo* : ${data.meteo}`);
  }

  // Section 1 : Débitmètres & Mesures Entrée / Sortie
  lines.push('');
  lines.push(`🔹 *ENTRÉE (Eaux Brutes)*`);
  lines.push(`  • Heure relève : ${data.entreeHeure || '-'} (${data.entreeDate || '-'})`);
  lines.push(`  • ${data.presencePreleveur ? 'Température préleveur' : "Température de l'eau prélevée"} : ${data.entreeTemperature ? `${data.entreeTemperature} °C` : '-'}`);
  if (data.entreeHasDebimetre) {
    lines.push(`  • Débitmètre : OUI (Débit cumulé mesuré 24h : ${data.entreeDebit ? `${Number(data.entreeDebit).toLocaleString('fr-FR')} m³` : '-'})`);
  } else {
    lines.push(`  • Débitmètre : NON (Débit estimé : ${data.entreeDebit ? `${Number(data.entreeDebit).toLocaleString('fr-FR')} m³` : '-'})`);
    lines.push(`    → Temps de marche pompes : ${data.entreeTempsMarchePompes || '-'} h | Débit nominal : ${data.entreeDebitPompeNominal || '-'} m³/h`);
  }
  lines.push(`  • Photo : ${data.entreePhoto ? '✓ Enregistrée' : 'Non jointe'}`);

  lines.push('');
  lines.push(`🔹 *SORTIE (Eaux Traitées / Rejet)*`);
  lines.push(`  • Heure relève : ${data.sortieHeure || '-'} (${data.sortieDate || '-'})`);
  lines.push(`  • ${data.presencePreleveur ? 'Température préleveur' : "Température de l'eau prélevée"} : ${data.sortieTemperature ? `${data.sortieTemperature} °C` : '-'}`);
  if (data.sortieHasDebimetre) {
    lines.push(`  • Débitmètre : OUI (Débit cumulé mesuré 24h : ${data.sortieDebit ? `${Number(data.sortieDebit).toLocaleString('fr-FR')} m³` : '-'})`);
  } else {
    lines.push(`  • Débitmètre : NON (Débit estimé : ${data.sortieDebit ? `${Number(data.sortieDebit).toLocaleString('fr-FR')} m³` : '-'})`);
    lines.push(`    → Temps de marche pompes : ${data.sortieTempsMarchePompes || '-'} h | Débit nominal : ${data.sortieDebitPompeNominal || '-'} m³/h`);
  }
  lines.push(`  • Photo préleveur : ${data.sortiePhoto ? '✓ Enregistrée' : 'Non jointe'}`);

  // Section 2 : Équipements Préleveurs
  lines.push('');
  lines.push(`⚙️ *PARAMÈTRES DES PRÉLEVEURS*`);
  if (data.presencePreleveur) {
    lines.push(`  • Présence de préleveur(s) : OUI`);
    lines.push(`  • Type de préleveur : ${data.preleveurType || 'Non précisé'}`);
    lines.push(`  • Type d'asservissement : ${data.preleveurAsservissement === 'débit' ? 'Au débit' : 'Au temps'}`);
    if (data.preleveurAsservissement === 'débit') {
      lines.push(`  • Fréquence de prélèvement : Tous les ${data.preleveurFrequenceDebit || '-'} m³`);
    } else {
      lines.push(`  • Fréquence de prélèvement : Toutes les ${data.preleveurFrequenceTemps || '-'} minutes`);
    }
  } else {
    lines.push(`  • Présence de préleveur(s) : NON (Prélèvement manuel / ponctuel)`);
  }

  // Section 3 : Synthèse volumétrique
  if (ratio) {
    lines.push('');
    lines.push(`📊 *SYNTHÈSE HYDRAULIQUE 24H*`);
    lines.push(`  • Ratio Sortie / Entrée : ${ratio} %`);
    if (delta) {
      lines.push(`  • Écart volumétrique : ${Number(delta) > 0 ? `+${delta}` : delta} m³`);
    }
  }

  if (data.observations && data.observations.trim()) {
    lines.push('');
    lines.push(`📝 *Remarques terrain* :`);
    lines.push(data.observations.trim());
  }

  lines.push('');
  lines.push(`📎 *Fichier PDF officiel joint* : ${fileName || 'Bilan_Autosurveillance.pdf'}`);
  lines.push(`(Le rapport complet certifié avec photographies horodatées est joint au format PDF)`);

  return lines.join('\n');
}

/**
 * Envoie le rapport officiel avec le PDF joint via l'API backend (/api/send-email).
 * Garantit l'envoi du document sous forme de fichier PDF en pièce jointe.
 */
export async function sendEmailWithPdfAttachment(
  to: string,
  data: AutosurveillanceData,
  fileName: string,
  pdfBase64: string
): Promise<{ success: boolean; message: string; previewUrl?: string }> {
  const subject = `[Autosurveillance STEP] Bilan 24h - ${data.nomStep || 'Station'} (${data.dateAutosurveillance || ''})`;
  const textBody = generateReportSummary(data, fileName);

  const htmlBody = `
    <div style="font-family: Arial, sans-serif; color: #1e293b; max-width: 650px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
      <div style="background: #0f4c81; color: #ffffff; padding: 16px 20px; border-radius: 8px; margin-bottom: 20px;">
        <h1 style="margin: 0; font-size: 18px;">Bilan Réglementaire d'Autosurveillance STEP 24h</h1>
        <p style="margin: 4px 0 0; font-size: 13px; opacity: 0.9;">Station d'Épuration : ${data.nomStep} • Prélèvements du ${data.dateAutosurveillance}</p>
      </div>

      <p style="font-size: 14px; line-height: 1.5;">Bonjour,</p>
      <p style="font-size: 14px; line-height: 1.5;">
        Veuillez trouver ci-joint le <strong>rapport officiel complet d'autosurveillance 24h</strong> intégrant les mesures de températures, débits, paramètres d'exploitation et photographies certifiées des préleveurs.
      </p>

      <div style="background: #f8fafc; border-left: 4px solid #0284c7; padding: 12px 16px; margin: 18px 0; border-radius: 4px;">
        <p style="margin: 0; font-size: 13px; font-weight: bold; color: #0369a1;">📎 Pièce jointe incluse :</p>
        <p style="margin: 4px 0 0; font-size: 13px; font-family: monospace;">${fileName}</p>
      </div>

      <div style="background: #f1f5f9; padding: 14px; border-radius: 8px; font-size: 12px; line-height: 1.6; white-space: pre-wrap; font-family: monospace;">
${textBody}
      </div>

      <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0 16px;" />
      <p style="font-size: 11px; color: #64748b; margin: 0;">
        Fiche d'intervention terrain certifiée conforme • Créé par Laurent Juillien avec l'assistance de l'IA
      </p>
    </div>
  `;

  try {
    const res = await fetch('/api/send-email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to,
        subject,
        text: textBody,
        html: htmlBody,
        attachment: {
          filename: fileName,
          content: pdfBase64,
        },
      }),
    });

    const json = await res.json();
    if (res.ok && json.success) {
      return {
        success: true,
        message: json.message || `E-mail envoyé avec succès à ${to} avec la pièce jointe PDF.`,
        previewUrl: json.previewUrl,
      };
    } else {
      return {
        success: false,
        message: json.error || "Une erreur est survenue lors de l'envoi de l'e-mail.",
      };
    }
  } catch (err: any) {
    console.error("Erreur appel /api/send-email :", err);
    return {
      success: false,
      message: err?.message || "Impossible de joindre le service d'envoi d'e-mails.",
    };
  }
}

/**
 * Partage direct vers WhatsApp.
 * Si le navigateur supporte le partage de fichier (Web Share API avec fichiers sur mobile),
 * partage directement le fichier PDF dans WhatsApp.
 * Sinon, ouvre le lien WhatsApp pré-rempli avec la synthèse complète.
 */
export async function shareToWhatsApp(
  data: AutosurveillanceData,
  pdfBlob?: Blob,
  fileName?: string
): Promise<{ method: 'native_file' | 'whatsapp_link'; success: boolean }> {
  const summaryText = generateReportSummary(data, fileName);

  // Tentative de partage natif avec le fichier PDF si supporté (smartphone)
  if (pdfBlob && typeof navigator !== 'undefined' && navigator.share && navigator.canShare) {
    try {
      const file = new File([pdfBlob], fileName || 'Bilan_Autosurveillance.pdf', {
        type: 'application/pdf',
      });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: `Bilan Autosurveillance STEP - ${data.nomStep}`,
          text: summaryText,
          files: [file],
        });
        return { method: 'native_file', success: true };
      }
    } catch (e: any) {
      if (e?.name === 'AbortError') {
        return { method: 'native_file', success: false };
      }
      console.warn("Échec du partage natif de fichier, passage au lien WhatsApp", e);
    }
  }

  // Redirection WhatsApp via https://wa.me/?text=
  const encodedText = encodeURIComponent(summaryText);
  const waUrl = `https://wa.me/?text=${encodedText}`;
  window.open(waUrl, '_blank', 'noopener,noreferrer');
  return { method: 'whatsapp_link', success: true };
}

/**
 * Partage natif ou mailto de secours
 */
export async function shareReportNatively(
  data: AutosurveillanceData,
  pdfBlob: Blob,
  fileName: string
): Promise<boolean> {
  const summaryText = generateReportSummary(data, fileName);
  if (typeof navigator !== 'undefined' && navigator.share && navigator.canShare) {
    try {
      const file = new File([pdfBlob], fileName, { type: 'application/pdf' });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: `Bilan Autosurveillance STEP - ${data.nomStep}`,
          text: summaryText,
          files: [file],
        });
        return true;
      }
    } catch (e: any) {
      if (e?.name === 'AbortError') return false;
    }
  }
  return false;
}

/**
 * Copie le texte de synthèse dans le presse-papier
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const successful = document.execCommand('copy');
    document.body.removeChild(textarea);
    return successful;
  } catch (err) {
    console.warn("Échec de la copie dans le presse-papier :", err);
    return false;
  }
}

/**
 * Ouvre le client de messagerie par défaut avec les paramètres pré-remplis
 */
export function sendReportByEmail(data: AutosurveillanceData, fileName?: string): void {
  const subject = encodeURIComponent(`[Autosurveillance STEP] Bilan 24h - ${data.nomStep || 'Station'} (${data.dateAutosurveillance || ''})`);
  const body = encodeURIComponent(generateReportSummary(data, fileName));
  const to = data.destinataireEmail ? encodeURIComponent(data.destinataireEmail) : '';
  const mailtoUrl = `mailto:${to}?subject=${subject}&body=${body}`;
  window.location.href = mailtoUrl;
}
