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
      doc.text(r.sub, colEntreeX + colWidth - 4, rY + 2
