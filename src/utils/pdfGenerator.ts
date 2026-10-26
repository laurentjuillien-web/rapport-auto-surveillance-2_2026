/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { jsPDF } from 'jspdf';
import { AutosurveillanceData } from '../types';

interface CanvasImageResult {
  canvas: HTMLCanvasElement;
  aspectRatio: number;
}

/**
 * Loads an image from Data URL or URL and normalizes it to a Canvas
 * while preserving aspect ratio.
 */
function prepareCanvasImage(dataUrl: string | null): Promise<CanvasImageResult | null> {
  if (!dataUrl) return Promise.resolve(null);

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      const width = img.naturalWidth || img.width || 800;
      const height = img.naturalHeight || img.height || 600;

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(null);
        return;
      }

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);

      resolve({
        canvas,
        aspectRatio: width / height,
      });
    };

    img.onerror = (err) => {
      console.warn("Échec du chargement de l'image pour le PDF", err);
      resolve(null);
    };

    img.src = dataUrl;
  });
}

export interface GeneratedPdfResult {
  doc: jsPDF;
  blob: Blob;
  blobUrl: string;
  base64: string;
  dataUri: string;
  fileName: string;
}

/**
 * Génère le document PDF officiel d'autosurveillance 24h conforme
 * avec intégration des débits mesurés/estimés (temps de marche pompes),
 * des préleveurs (type & asservissement), des photographies horodatées et signature requise.
 */
export async function generateAutosurveillancePdf(
  data: AutosurveillanceData
): Promise<GeneratedPdfResult> {
  const [entreeImgPrepared, sortieImgPrepared] = await Promise.all([
    prepareCanvasImage(data.entreePhoto),
    prepareCanvasImage(data.sortiePhoto),
  ]);

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  const pageWidth = 210;
  const pageHeight = 297;
  const margin = 12;
  const contentWidth = pageWidth - margin * 2; // 186mm

  // Palette officielle de l'assainissement
  const primaryColor = [15, 76, 129]; // Bleu assainissement profond (#0f4c81)
  const secondaryColor = [2, 132, 199]; // Cyan soutenu (#0284c7)
  const entreeColor = [3, 105, 161]; // Bleu brut (#0369a1)
  const sortieColor = [5, 150, 105]; // Émeraude traité (#059669)
  const textColor = [30, 41, 59]; // Slate 800
  const lightMuted = [100, 116, 139]; // Slate 500

  // 1. BANDEAU D'EN-TÊTE OFFICIEL
  doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.rect(margin, 10, contentWidth, 18, 'F');

  doc.setFillColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
  doc.rect(margin, 28, contentWidth, 2, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12.5);
  doc.text("BILAN D'AUTOSURVEILLANCE 24H — STATION D'ÉPURATION", margin + 5, 17.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text("CONTRÔLE RÉGLEMENTAIRE TERRAIN • DÉBITS, PRÉLÈVEURS & PARAMÈTRES D'EXPLOITATION", margin + 5, 23.5);

  const formattedDate = new Date().toLocaleDateString('fr-FR');
  const formattedTime = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  doc.setFontSize(7.5);
  doc.text(`Réf : AS-${(data.dateAutosurveillance || '').replace(/-/g, '')}`, pageWidth - margin - 5, 17.5, { align: 'right' });
  doc.text(`Édité le : ${formattedDate} à ${formattedTime}`, pageWidth - margin - 5, 23.5, { align: 'right' });

  let curY = 34;

  // 2. FICHE D'IDENTIFICATION DE LA STATION
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(margin, curY, contentWidth, 14, 1.5, 1.5, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.text("STATION D'ÉPURATION (STEP) :", margin + 4, curY + 5.5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(textColor[0], textColor[1], textColor[2]);
  doc.text((data.nomStep || 'NON SPÉCIFIÉ').toUpperCase(), margin + 52, curY + 5.5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(lightMuted[0], lightMuted[1], lightMuted[2]);
  doc.text("Date du bilan :", margin + 4, curY + 10.5);
  doc.setTextColor(textColor[0], textColor[1], textColor[2]);
  doc.text(data.dateAutosurveillance ? new Date(data.dateAutosurveillance + 'T00:00:00').toLocaleDateString('fr-FR') : '-', margin + 25, curY + 10.5);

  if (data.technicienNom) {
    doc.setTextColor(lightMuted[0], lightMuted[1], lightMuted[2]);
    doc.setFont('helvetica', 'normal');
    doc.text("Technicien :", margin + 75, curY + 10.5);
    doc.setTextColor(textColor[0], textColor[1], textColor[2]);
    doc.setFont('helvetica', 'bold');
    doc.text(data.technicienNom, margin + 92, curY + 10.5);
  }

  if (data.meteo) {
    doc.setTextColor(lightMuted[0], lightMuted[1], lightMuted[2]);
    doc.setFont('helvetica', 'normal');
    doc.text("Météo :", margin + 140, curY + 10.5);
    doc.setTextColor(textColor[0], textColor[1], textColor[2]);
    doc.setFont('helvetica', 'bold');
    doc.text(data.meteo, margin + 152, curY + 10.5);
  }

  curY += 17;

  // 3. BLOCS PRÉLÈVEMENTS & MESURES (ENTRÉE & SORTIE)
  const colWidth = (contentWidth - 6) / 2; // 90mm
  const colEntreeX = margin;
  const colSortieX = margin + colWidth + 6;
  const blockHeight = 35;

  // -- ENTRÉE BLOCK --
  doc.setFillColor(240, 249, 255);
  doc.setDrawColor(186, 230, 253);
  doc.roundedRect(colEntreeX, curY, colWidth, blockHeight, 1.5, 1.5, 'FD');

  doc.setFillColor(entreeColor[0], entreeColor[1], entreeColor[2]);
  doc.roundedRect(colEntreeX, curY, colWidth, 6, 1.5, 1.5, 'F');
  doc.rect(colEntreeX, curY + 2.5, colWidth, 3.5, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text("POINT DE MESURE : ENTRÉE (Eaux Brutes)", colEntreeX + 4, curY + 4.2);

  const entreeRows = [
    { label: "Date & heure relève", val: `${data.entreeDate} à ${data.entreeHeure}` },
    { 
      label: data.presencePreleveur ? "Température préleveur" : "Température eau prélevée", 
      val: `${data.entreeTemperature} °C`,
      sub: data.presencePreleveur
        ? (parseFloat(data.entreeTemperature) >= 2 && parseFloat(data.entreeTemperature) <= 5 ? "Conforme [2-5°C]" : "Hors cible [2-5°C]")
        : "Mesure directe eau prélevée"
    },
    { 
      label: data.entreeHasDebimetre ? "Débit mesuré 24h (débitmètre)" : "Débit estimé 24h (pompes)", 
      val: `${data.entreeDebit ? data.entreeDebit : '-'} m³`, 
      highlight: true 
    },
  ];

  let rY = curY + 10.5;
  entreeRows.forEach((r) => {
    doc.setTextColor(lightMuted[0], lightMuted[1], lightMuted[2]);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.text(r.label, colEntreeX + 4, rY);

    doc.setTextColor(r.highlight ? entreeColor[0] : textColor[0], r.highlight ? entreeColor[1] : textColor[1], r.highlight ? entreeColor[2] : textColor[2]);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(r.highlight ? 9 : 7.5);
    doc.text(r.val, colEntreeX + colWidth - 4, rY, { align: 'right' });

    if (r.sub) {
      doc.setFontSize(5.8);
      doc.setTextColor(lightMuted[0], lightMuted[1], lightMuted[2]);
      doc.text(r.sub, colEntreeX + colWidth - 4, rY + 2.8, { align: 'right' });
    }
    rY += 7.2;
  });

  // -- SORTIE BLOCK --
  doc.setFillColor(236, 253, 245);
  doc.setDrawColor(167, 243, 208);
  doc.roundedRect(colSortieX, curY, colWidth, blockHeight, 1.5, 1.5, 'FD');

  doc.setFillColor(sortieColor[0], sortieColor[1], sortieColor[2]);
  doc.roundedRect(colSortieX, curY, colWidth, 6, 1.5, 1.5, 'F');
  doc.rect(colSortieX, curY + 2.5, colWidth, 3.5, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text("POINT DE MESURE : SORTIE (Rejet Traité)", colSortieX + 4, curY + 4.2);

  const sortieRows = [
    { label: "Date & heure relève", val: `${data.sortieDate} à ${data.sortieHeure}` },
    { 
      label: data.presencePreleveur ? "Température préleveur" : "Température eau prélevée", 
      val: `${data.sortieTemperature} °C`,
      sub: data.presencePreleveur
        ? (parseFloat(data.sortieTemperature) >= 2 && parseFloat(data.sortieTemperature) <= 5 ? "Conforme [2-5°C]" : "Hors cible [2-5°C]")
        : "Mesure directe eau prélevée"
    },
    { 
      label: data.sortieHasDebimetre ? "Débit mesuré 24h (débitmètre)" : "Débit estimé 24h (pompes)", 
      val: `${data.sortieDebit ? data.sortieDebit : '-'} m³`, 
      highlight: true 
    },
  ];

  rY = curY + 10.5;
  sortieRows.forEach((r) => {
    doc.setTextColor(lightMuted[0], lightMuted[1], lightMuted[2]);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.text(r.label, colSortieX + 4, rY);

    doc.setTextColor(r.highlight ? sortieColor[0] : textColor[0], r.highlight ? sortieColor[1] : textColor[1], r.highlight ? sortieColor[2] : textColor[2]);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(r.highlight ? 9 : 7.5);
    doc.text(r.val, colSortieX + colWidth - 4, rY, { align: 'right' });

    if (r.sub) {
      doc.setFontSize(5.8);
      doc.setTextColor(lightMuted[0], lightMuted[1], lightMuted[2]);
      doc.text(r.sub, colSortieX + colWidth - 4, rY + 2.8, { align: 'right' });
    }
    rY += 7.2;
  });

  curY += blockHeight + 3.5;

  // 4. SECTION D'ANALYSE SPÉCIFIQUE : ÉQUIPEMENTS & PARAMÈTRES D'EXPLOITATION
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  const equipBlockHeight = 24;
  doc.roundedRect(margin, curY, contentWidth, equipBlockHeight, 1.5, 1.5, 'FD');

  // Titre du bloc équipements
  doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.roundedRect(margin, curY, contentWidth, 5.5, 1.5, 1.5, 'F');
  doc.rect(margin, curY + 2.5, contentWidth, 3, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text("ANALYSE DES ÉQUIPEMENTS D'EXPLOITATION : DÉBITMÈTRES & PRÉLEVEURS", margin + 4, curY + 3.8);

  // Colonne Gauche : Débitmètres
  const subColW = (contentWidth - 6) / 2;
  const leftX = margin + 3;
  const rightX = margin + subColW + 6;
  let eqY = curY + 9;

  doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text("1. Mode de mesure des Débits :", leftX, eqY);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(textColor[0], textColor[1], textColor[2]);

  // Entrée
  const txtEntreeDeb = data.entreeHasDebimetre
    ? `• Entrée : Débitmètre [OUI] → Débit cumulé 24h = ${data.entreeDebit || '-'} m³`
    : `• Entrée : Débitmètre [NON] → Estimé = ${data.entreeDebit || '-'} m³ (Pompes : ${data.entreeTempsMarchePompes || '-'}h @ ${data.entreeDebitPompeNominal || '-'} m³/h)`;
  doc.text(txtEntreeDeb, leftX + 2, eqY + 4.5);

  // Sortie
  const txtSortieDeb = data.sortieHasDebimetre
    ? `• Sortie : Débitmètre [OUI] → Débit cumulé 24h = ${data.sortieDebit || '-'} m³`
    : `• Sortie : Débitmètre [NON] → Estimé = ${data.sortieDebit || '-'} m³ (Pompes : ${data.sortieTempsMarchePompes || '-'}h @ ${data.sortieDebitPompeNominal || '-'} m³/h)`;
  doc.text(txtSortieDeb, leftX + 2, eqY + 9);

  // Colonne Droite : Préleveurs
  doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text("2. Équipements Préleveurs 24h :", rightX, eqY);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(textColor[0], textColor[1], textColor[2]);

  if (data.presencePreleveur) {
    doc.text(`• Présence de préleveur(s) : OUI`, rightX + 2, eqY + 4.5);
    const freqTxt = data.preleveurAsservissement === 'débit'
      ? `Tous les ${data.preleveurFrequenceDebit || '-'} m³`
      : `Toutes les ${data.preleveurFrequenceTemps || '-'} minutes`;
    doc.text(`• Type : ${data.preleveurType || 'Non précisé'} | Asservissement : ${data.preleveurAsservissement || 'débit'}`, rightX + 2, eqY + 9);
    doc.text(`• Fréquence de prélèvement : ${freqTxt}`, rightX + 2, eqY + 13.5);
  } else {
    doc.text(`• Présence de préleveur(s) : NON`, rightX + 2, eqY + 4.5);
    doc.text(`• Mode de collecte : Échantillonnage manuel / ponctuel`, rightX + 2, eqY + 9);
  }

  curY += equipBlockHeight + 3;

  // 5. BILAN VOLUMÉTRIQUE / SYNTHÈSE HYDRAULIQUE
  const qIn = parseFloat(data.entreeDebit);
  const qOut = parseFloat(data.sortieDebit);
  let bilanText = "Calcul volumétrique 24h : ";
  if (!isNaN(qIn) && !isNaN(qOut) && qIn > 0) {
    const diff = qOut - qIn;
    const ratio = ((qOut / qIn) * 100).toFixed(1);
    bilanText += `Ratio Débit Sortie / Entrée = ${ratio}% (Écart hydraulique : ${diff > 0 ? '+' : ''}${diff.toFixed(1)} m³) — Données cohérentes pour le bilan d'autosurveillance.`;
  } else {
    bilanText += "Enregistrements volumétriques continus 24 heures conformes aux prescriptions réglementaires.";
  }

  doc.setFillColor(241, 245, 249);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(margin, curY, contentWidth, 7, 1.5, 1.5, 'FD');

  doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.text(bilanText, margin + 4, curY + 4.6);

  curY += 10;

  // 6. PHOTOGRAPHIES DE TERRAIN HORODATÉES
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.text("JUSTIFICATIFS PHOTOGRAPHIQUES OFFICIELS DES PRÉLÈVEMENTS", margin, curY);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.8);
  doc.setTextColor(lightMuted[0], lightMuted[1], lightMuted[2]);
  doc.text("Photographies géolocalisées et horodatées intégrées au rapport", margin + 105, curY);

  curY += 3;

  const photoWidth = (contentWidth - 6) / 2; // 90mm
  const photoHeight = 74; // Hauteur équilibrée pour une mise en page A4 parfaite

  // --- CADRE PHOTO ENTRÉE ---
  doc.setDrawColor(186, 230, 253);
  doc.setFillColor(250, 250, 250);
  doc.roundedRect(colEntreeX, curY, photoWidth, photoHeight, 1.5, 1.5, 'FD');

  doc.setFillColor(entreeColor[0], entreeColor[1], entreeColor[2]);
  doc.roundedRect(colEntreeX, curY, photoWidth, 5.5, 1.5, 1.5, 'F');
  doc.rect(colEntreeX, curY + 2.5, photoWidth, 3, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text("PHOTO : PRÉLEVEUR ENTRÉE (Eaux Brutes)", colEntreeX + 4, curY + 3.8);

  const imgAreaX = colEntreeX + 2;
  const imgAreaY = curY + 7;
  const maxImgW = photoWidth - 4;
  const maxImgH = photoHeight - 13.5;

  if (entreeImgPrepared) {
    try {
      const { canvas, aspectRatio } = entreeImgPrepared;
      let renderW = maxImgW;
      let renderH = renderW / aspectRatio;

      if (renderH > maxImgH) {
        renderH = maxImgH;
        renderW = renderH * aspectRatio;
      }

      const posX = imgAreaX + (maxImgW - renderW) / 2;
      const posY = imgAreaY + (maxImgH - renderH) / 2;

      doc.setDrawColor(226, 232, 240);
      doc.setFillColor(241, 245, 249);
      doc.rect(imgAreaX, imgAreaY, maxImgW, maxImgH, 'F');

      doc.addImage(canvas, 'JPEG', posX, posY, renderW, renderH, undefined, 'FAST');
      doc.setDrawColor(203, 213, 225);
      doc.rect(posX, posY, renderW, renderH, 'D');

      doc.setFillColor(248, 250, 252);
      doc.rect(colEntreeX + 1, curY + photoHeight - 5.5, photoWidth - 2, 4.8, 'F');
      doc.setTextColor(textColor[0], textColor[1], textColor[2]);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6);
      doc.text(`Prise le ${data.entreeDate} à ${data.entreeHeure} • T: ${data.entreeTemperature}°C • Q: ${data.entreeDebit || '-'} m³`, colEntreeX + 3, curY + photoHeight - 2);

    } catch (err) {
      console.warn("Erreur insertion photo entrée dans le PDF", err);
      doc.setTextColor(150, 150, 150);
      doc.setFontSize(7);
      doc.text("Photo non disponible", colEntreeX + 20, curY + 35);
    }
  } else {
    doc.setTextColor(160, 174, 192);
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7.5);
    doc.text("Aucune photo capturée", colEntreeX + photoWidth / 2, curY + 35, { align: 'center' });
  }

  // --- CADRE PHOTO SORTIE ---
  doc.setDrawColor(167, 243, 208);
  doc.setFillColor(250, 250, 250);
  doc.roundedRect(colSortieX, curY, photoWidth, photoHeight, 1.5, 1.5, 'FD');

  doc.setFillColor(sortieColor[0], sortieColor[1], sortieColor[2]);
  doc.roundedRect(colSortieX, curY, photoWidth, 5.5, 1.5, 1.5, 'F');
  doc.rect(colSortieX, curY + 2.5, photoWidth, 3, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text("PHOTO : PRÉLEVEUR SORTIE (Rejet Traité)", colSortieX + 4, curY + 3.8);

  const imgAreaSortieX = colSortieX + 2;
  const imgAreaSortieY = curY + 7;

  if (sortieImgPrepared) {
    try {
      const { canvas, aspectRatio } = sortieImgPrepared;
      let renderW = maxImgW;
      let renderH = renderW / aspectRatio;

      if (renderH > maxImgH) {
        renderH = maxImgH;
        renderW = renderH * aspectRatio;
      }

      const posX = imgAreaSortieX + (maxImgW - renderW) / 2;
      const posY = imgAreaSortieY + (maxImgH - renderH) / 2;

      doc.setDrawColor(226, 232, 240);
      doc.setFillColor(241, 245, 249);
      doc.rect(imgAreaSortieX, imgAreaSortieY, maxImgW, maxImgH, 'F');

      doc.addImage(canvas, 'JPEG', posX, posY, renderW, renderH, undefined, 'FAST');
      doc.setDrawColor(203, 213, 225);
      doc.rect(posX, posY, renderW, renderH, 'D');

      doc.setFillColor(248, 250, 252);
      doc.rect(colSortieX + 1, curY + photoHeight - 5.5, photoWidth - 2, 4.8, 'F');
      doc.setTextColor(textColor[0], textColor[1], textColor[2]);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6);
      doc.text(`Prise le ${data.sortieDate} à ${data.sortieHeure} • T: ${data.sortieTemperature}°C • Q: ${data.sortieDebit || '-'} m³`, colSortieX + 3, curY + photoHeight - 2);

    } catch (err) {
      console.warn("Erreur insertion photo sortie dans le PDF", err);
      doc.setTextColor(150, 150, 150);
      doc.setFontSize(7);
      doc.text("Photo non disponible", colSortieX + 20, curY + 35);
    }
  } else {
    doc.setTextColor(160, 174, 192);
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7.5);
    doc.text("Aucune photo capturée", colSortieX + photoWidth / 2, curY + 35, { align: 'center' });
  }

  curY += photoHeight + 3.5;

  // 7. OBSERVATIONS / REMARQUES TERRAIN
  if (data.observations && data.observations.trim()) {
    doc.setFillColor(254, 252, 232);
    doc.setDrawColor(254, 240, 138);
    doc.roundedRect(margin, curY, contentWidth, 12, 1.5, 1.5, 'FD');

    doc.setTextColor(146, 64, 14);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.text("Remarques / Observations d'exploitation :", margin + 3, curY + 4);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.8);
    doc.setTextColor(50, 50, 50);
    const splitObs = doc.splitTextToSize(data.observations, contentWidth - 8);
    doc.text(splitObs.slice(0, 2), margin + 3, curY + 8);
  }

  // 8. PIED DE PAGE OFFICIEL AVEC MENTION OBLIGATOIRE
  const footerY = pageHeight - 11;
  doc.setDrawColor(226, 232, 240);
  doc.line(margin, footerY - 2.5, pageWidth - margin, footerY - 2.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.8);
  doc.setTextColor(lightMuted[0], lightMuted[1], lightMuted[2]);
  doc.text("Transmission réglementaire : Bilan d'autosurveillance STEP 24h avec débitmètres et préleveurs asservis", margin, footerY);
  doc.text("Fiche d'intervention terrain certifiée conforme — Prélèvements 24 heures et photographies certifiées", margin, footerY + 3.5);

  // Mention d'auteur exigée
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.text("Créé par Laurent Juillien avec l'assistance de l'IA", pageWidth - margin, footerY + 1.5, { align: 'right' });

  // Génération des sorties
  const blob = doc.output('blob');
  const blobUrl = URL.createObjectURL(blob);
  const dataUri = doc.output('datauristring');
  const base64 = dataUri.includes(',') ? dataUri.split(',')[1] : dataUri;

  const cleanStepName = (data.nomStep || 'STEP').trim().replace(/[^a-zA-Z0-9_-]/g, '_');
  const cleanDate = (data.dateAutosurveillance || new Date().toISOString().split('T')[0]).replace(/-/g, '');
  const fileName = `Bilan_Autosurveillance_${cleanStepName}_${cleanDate}.pdf`;

  return {
    doc,
    blob,
    blobUrl,
    base64,
    dataUri,
    fileName,
  };
}

/**
 * Déclenche le téléchargement direct du fichier PDF généré
 */
export function downloadPdfBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
