/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  Droplets,
  Calendar,
  Clock,
  Thermometer,
  Gauge,
  Camera,
  Trash2,
  RefreshCw,
  Download,
  AlertCircle,
  CheckCircle2,
  Sparkles,
  FileText,
  Eye,
  X,
  FileCode,
  User as UserIcon,
  CloudSun,
  Share2,
  MessageCircle,
  Mail,
  Copy,
  Check,
  Send,
  Smartphone,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { AutosurveillanceData, ValidationErrors, GenerationStep } from './types';
import { processFieldPhoto } from './utils/imageUtils';
import { generateAutosurveillancePdf, downloadPdfBlob, GeneratedPdfResult } from './utils/pdfGenerator';
import {
  shareToWhatsApp,
  sendEmailWithPdfAttachment,
  shareReportNatively,
  sendReportByEmail,
  generateReportSummary,
  copyToClipboard,
} from './utils/shareUtils';

const STORAGE_KEY = 'step_autosurveillance_draft_v2';

export default function App() {
  const today = new Date().toISOString().split('T')[0];
  const now = new Date();
  const defaultHour = `${String(now.getHours()).padStart(2, '0')}:${String(Math.floor(now.getMinutes() / 5) * 5).padStart(2, '0')}`;

  const [formData, setFormData] = useState<AutosurveillanceData>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.warn("Could not load draft from localStorage", e);
    }
    return {
      nomStep: '',
      dateAutosurveillance: today,
      technicienNom: '',
      meteo: 'Soleil',
      observations: '',
      // 1. Débitmètres
      entreeHasDebimetre: true,
      entreeDebit: '',
      entreeTempsMarchePompes: '',
      entreeDebitPompeNominal: '',
      entreeDebitEstime: '',
      sortieHasDebimetre: true,
      sortieDebit: '',
      sortieTempsMarchePompes: '',
      sortieDebitPompeNominal: '',
      sortieDebitEstime: '',
      // 2. Préleveurs
      presencePreleveur: true,
      preleveurType: 'ISO monoflacon dépression',
      preleveurAsservissement: 'débit',
      preleveurFrequenceDebit: '10',
      preleveurFrequenceTemps: '15',
      // Bilan Entrée & Sortie
      entreeDate: today,
      entreeHeure: defaultHour,
      entreeTemperature: '',
      entreePhoto: null,
      entreePhotoNom: '',
      sortieDate: today,
      sortieHeure: defaultHour,
      sortieTemperature: '',
      sortiePhoto: null,
      sortiePhotoNom: '',
      destinataireEmail: '',
    };
  });

  const [errors, setErrors] = useState<ValidationErrors>({});
  const [generationStep, setGenerationStep] = useState<GenerationStep>('idle');
  const [statusMessage, setStatusMessage] = useState('');
  const [generatedPdf, setGeneratedPdf] = useState<GeneratedPdfResult | null>(null);
  const [showPdfModal, setShowPdfModal] = useState(false);
  const [showPhotoModal, setShowPhotoModal] = useState<{ title: string; src: string } | null>(null);
  const [showHtmlExportModal, setShowHtmlExportModal] = useState(false);
  const [draftSavedAlert, setDraftSavedAlert] = useState(false);
  const [copiedSummary, setCopiedSummary] = useState(false);
  const [shareFeedback, setShareFeedback] = useState<string | null>(null);
  const [showSummaryPreview, setShowSummaryPreview] = useState(false);

  // Modale d'envoi d'e-mail avec pièce jointe PDF
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailSending, setEmailSending] = useState(false);
  const [emailStatus, setEmailStatus] = useState<{ success: boolean; message: string; previewUrl?: string } | null>(null);

  const entreeFileInputRef = useRef<HTMLInputElement>(null);
  const sortieFileInputRef = useRef<HTMLInputElement>(null);

  // Sauvegarde automatique du brouillon local
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(formData));
      setDraftSavedAlert(true);
      const t = setTimeout(() => setDraftSavedAlert(false), 2000);
      return () => clearTimeout(t);
    } catch {
      try {
        const light = { ...formData, entreePhoto: null, sortiePhoto: null };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(light));
      } catch (e2) {
        console.warn("Storage quota exceeded", e2);
      }
    }
  }, [formData]);

  const handleChange = (field: keyof AutosurveillanceData, value: any) => {
    setFormData((prev) => {
      const updated = { ...prev, [field]: value };

      // Calcul automatique de l'estimation de débit Entrée si pas de débitmètre
      if (
        !updated.entreeHasDebimetre &&
        (field === 'entreeTempsMarchePompes' ||
          field === 'entreeDebitPompeNominal' ||
          field === 'entreeHasDebimetre')
      ) {
        const t = parseFloat(updated.entreeTempsMarchePompes || '');
        const q = parseFloat(updated.entreeDebitPompeNominal || '');
        if (!isNaN(t) && !isNaN(q) && t >= 0 && q >= 0) {
          const est = (t * q).toFixed(1);
          updated.entreeDebitEstime = est;
          updated.entreeDebit = est;
        }
      }

      // Calcul automatique de l'estimation de débit Sortie si pas de débitmètre
      if (
        !updated.sortieHasDebimetre &&
        (field === 'sortieTempsMarchePompes' ||
          field === 'sortieDebitPompeNominal' ||
          field === 'sortieHasDebimetre')
      ) {
        const t = parseFloat(updated.sortieTempsMarchePompes || '');
        const q = parseFloat(updated.sortieDebitPompeNominal || '');
        if (!isNaN(t) && !isNaN(q) && t >= 0 && q >= 0) {
          const est = (t * q).toFixed(1);
          updated.sortieDebitEstime = est;
          updated.sortieDebit = est;
        }
      }

      return updated;
    });

    if (errors[field as keyof ValidationErrors]) {
      setErrors((prev) => {
        const copy = { ...prev };
        delete copy[field as keyof ValidationErrors];
        return copy;
      });
    }
  };

  const handlePhotoUpload = async (file: File, type: 'entree' | 'sortie') => {
    try {
      setGenerationStep('compressing');
      setStatusMessage(`Optimisation de la photo ${type === 'entree' ? 'Entrée' : 'Sortie'}...`);
      const { dataUrl, fileName } = await processFieldPhoto(file);

      if (type === 'entree') {
        setFormData((prev) => ({
          ...prev,
          entreePhoto: dataUrl,
          entreePhotoNom: fileName,
        }));
        setErrors((prev) => {
          const c = { ...prev };
          delete c.entreePhoto;
          return c;
        });
      } else {
        setFormData((prev) => ({
          ...prev,
          sortiePhoto: dataUrl,
          sortiePhotoNom: fileName,
        }));
        setErrors((prev) => {
          const c = { ...prev };
          delete c.sortiePhoto;
          return c;
        });
      }
      setGenerationStep('idle');
      setStatusMessage('');
    } catch (err: unknown) {
      setGenerationStep('idle');
      const message = err instanceof Error ? err.message : "Erreur inattendue";
      alert("Erreur lors de la capture photo : " + message);
    }
  };

  const removePhoto = (type: 'entree' | 'sortie') => {
    if (type === 'entree') {
      setFormData((prev) => ({ ...prev, entreePhoto: null, entreePhotoNom: '' }));
      if (entreeFileInputRef.current) entreeFileInputRef.current.value = '';
    } else {
      setFormData((prev) => ({ ...prev, sortiePhoto: null, sortiePhotoNom: '' }));
      if (sortieFileInputRef.current) sortieFileInputRef.current.value = '';
    }
  };

  // Partage vers WhatsApp avec attachement PDF
  const handleShareWhatsApp = async () => {
    if (!generatedPdf) return;
    try {
      // Téléchargement direct pour garantir que le fichier PDF est disponible localement
      downloadPdfBlob(generatedPdf.blob, generatedPdf.fileName);
      const result = await shareToWhatsApp(formData, generatedPdf.blob, generatedPdf.fileName);
      if (result.success) {
        if (result.method === 'native_file') {
          setShareFeedback("Fichier PDF officiel et récapitulatif partagés avec succès !");
        } else {
          setShareFeedback("Fichier PDF téléchargé sur votre appareil et WhatsApp ouvert avec la synthèse !");
        }
        setTimeout(() => setShareFeedback(null), 5000);
      }
    } catch (e) {
      console.error("Erreur partage WhatsApp", e);
    }
  };

  // Ouverture du dialogue d'envoi par e-mail avec PDF joint
  const handleOpenEmailModal = () => {
    if (!generatedPdf) return;
    setEmailStatus(null);
    setShowEmailModal(true);
  };

  // Envoi réel par e-mail avec pièce jointe PDF
  const handleSendEmailDirect = async (recipient: string) => {
    if (!generatedPdf) return;
    if (!recipient || !recipient.trim()) {
      alert("Veuillez renseigner une adresse e-mail valide.");
      return;
    }
    setEmailSending(true);
    setEmailStatus(null);
    try {
      const res = await sendEmailWithPdfAttachment(
        recipient.trim(),
        formData,
        generatedPdf.fileName,
        generatedPdf.base64
      );
      setEmailStatus(res);
      if (res.success) {
        setShareFeedback(`Rapport PDF envoyé avec succès à ${recipient.trim()}`);
        setTimeout(() => setShareFeedback(null), 5000);
      }
    } catch (err: any) {
      setEmailStatus({
        success: false,
        message: err?.message || "Erreur lors de l'envoi de l'e-mail.",
      });
    } finally {
      setEmailSending(false);
    }
  };

  // Envoi par e-mail via client de messagerie
  const handleSendEmail = () => {
    handleOpenEmailModal();
  };

  // Partage natif via application mobile (Gmail, Outlook, etc.) avec fichier PDF
  const handleShareEmailNative = async () => {
    if (!generatedPdf) return;
    try {
      const shared = await shareReportNatively(formData, generatedPdf.blob, generatedPdf.fileName);
      if (shared) {
        setShareFeedback("Rapport PDF officiel transmis via votre application de messagerie.");
        setTimeout(() => setShareFeedback(null), 4000);
        setShowEmailModal(false);
      } else {
        downloadPdfBlob(generatedPdf.blob, generatedPdf.fileName);
        sendReportByEmail(formData, generatedPdf.fileName);
      }
    } catch (e) {
      console.error("Erreur partage natif", e);
    }
  };

  // Copie de la synthèse dans le presse-papier
  const handleCopySummary = async () => {
    if (!generatedPdf) return;
    const text = generateReportSummary(formData, generatedPdf.fileName);
    const success = await copyToClipboard(text);
    if (success) {
      setCopiedSummary(true);
      setTimeout(() => setCopiedSummary(false), 2500);
    }
  };

  const validate = (): boolean => {
    const errs: ValidationErrors = {};

    if (!formData.nomStep.trim()) {
      errs.nomStep = "Le nom de la station d'épuration (STEP) est obligatoire.";
    }
    if (!formData.dateAutosurveillance) {
      errs.dateAutosurveillance = "La date de l'autosurveillance est obligatoire.";
    }

    // Entrée
    if (!formData.entreeDate) {
      errs.entreeDate = "Date de prélèvement obligatoire.";
    }
    if (!formData.entreeHeure) {
      errs.entreeHeure = "Heure de relève obligatoire.";
    }
    if (formData.entreeTemperature === '' || isNaN(Number(formData.entreeTemperature))) {
      errs.entreeTemperature = formData.presencePreleveur ? "Température au préleveur requise." : "Température de l'eau prélevée requise.";
    }
    if (formData.entreeHasDebimetre) {
      if (formData.entreeDebit === '' || isNaN(Number(formData.entreeDebit)) || Number(formData.entreeDebit) < 0) {
        errs.entreeDebit = "Débit cumulé 24h valide requis (>= 0 m³).";
      }
    } else {
      if (!formData.entreeTempsMarchePompes || isNaN(Number(formData.entreeTempsMarchePompes)) || Number(formData.entreeTempsMarchePompes) < 0) {
        errs.entreeTempsMarchePompes = "Temps de marche des pompes requis (>= 0 h).";
      }
      if (formData.entreeDebit === '' || isNaN(Number(formData.entreeDebit)) || Number(formData.entreeDebit) < 0) {
        errs.entreeDebit = "Estimation du débit requise (calculée via le temps de marche des pompes).";
      }
    }
    if (!formData.entreePhoto) {
      errs.entreePhoto = formData.presencePreleveur ? "La photo du préleveur Entrée est obligatoire." : "La photo du prélèvement Entrée est obligatoire.";
    }

    // Sortie
    if (!formData.sortieDate) {
      errs.sortieDate = "Date de prélèvement obligatoire.";
    }
    if (!formData.sortieHeure) {
      errs.sortieHeure = "Heure de relève obligatoire.";
    }
    if (formData.sortieTemperature === '' || isNaN(Number(formData.sortieTemperature))) {
      errs.sortieTemperature = formData.presencePreleveur ? "Température au préleveur requise." : "Température de l'eau prélevée requise.";
    }
    if (formData.sortieHasDebimetre) {
      if (formData.sortieDebit === '' || isNaN(Number(formData.sortieDebit)) || Number(formData.sortieDebit) < 0) {
        errs.sortieDebit = "Débit cumulé 24h valide requis (>= 0 m³).";
      }
    } else {
      if (!formData.sortieTempsMarchePompes || isNaN(Number(formData.sortieTempsMarchePompes)) || Number(formData.sortieTempsMarchePompes) < 0) {
        errs.sortieTempsMarchePompes = "Temps de marche des pompes requis (>= 0 h).";
      }
      if (formData.sortieDebit === '' || isNaN(Number(formData.sortieDebit)) || Number(formData.sortieDebit) < 0) {
        errs.sortieDebit = "Estimation du débit requise (calculée via le temps de marche des pompes).";
      }
    }
    if (!formData.sortiePhoto) {
      errs.sortiePhoto = formData.presencePreleveur ? "La photo du préleveur Sortie est obligatoire." : "La photo du prélèvement Sortie est obligatoire.";
    }

    // Préleveurs
    if (formData.presencePreleveur) {
      if (!formData.preleveurType) {
        errs.preleveurType = "Type de préleveur requis.";
      }
      if (!formData.preleveurAsservissement) {
        errs.preleveurAsservissement = "Type d'asservissement requis.";
      }
      if (formData.preleveurAsservissement === 'débit' && (!formData.preleveurFrequenceDebit || Number(formData.preleveurFrequenceDebit) <= 0)) {
        errs.preleveurFrequence = "Fréquence de prélèvement au débit requise (ex: tous les X m³).";
      }
      if (formData.preleveurAsservissement === 'temps' && (!formData.preleveurFrequenceTemps || Number(formData.preleveurFrequenceTemps) <= 0)) {
        errs.preleveurFrequence = "Fréquence de prélèvement au temps requise (ex: toutes les X minutes).";
      }
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) {
      const firstError = document.querySelector('.border-rose-500, .text-rose-500');
      if (firstError) {
        firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      return;
    }

    setGenerationStep('generating_pdf');
    setStatusMessage("Génération du document PDF officiel et intégration des photographies horodatées...");

    try {
      await new Promise((r) => setTimeout(r, 200));

      // 1. Générer le document PDF haute définition avec photos horodatées
      const res = await generateAutosurveillancePdf(formData);
      setGeneratedPdf(res);

      // 2. Télécharger automatiquement le PDF sur l'appareil
      downloadPdfBlob(res.blob, res.fileName);

      setGenerationStep('completed');
      setShowPdfModal(true);
    } catch (err: unknown) {
      console.error(err);
      setGenerationStep('error');
      const message = err instanceof Error ? err.message : "Erreur inattendue";
      alert("Erreur lors de la génération du rapport : " + message);
    } finally {
      if (generationStep !== 'error') {
        setGenerationStep('idle');
      }
    }
  };

  // Remplissage avec données de démonstration réalistes
  const handleLoadSample = () => {
    const generateSampleCanvas = (title: string, color: string): string => {
      const c = document.createElement('canvas');
      c.width = 640;
      c.height = 480;
      const ctx = c.getContext('2d');
      if (!ctx) return '';

      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, 640, 480);

      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 1.5;
      for (let x = 0; x < 640; x += 40) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 480); ctx.stroke();
      }
      for (let y = 0; y < 480; y += 40) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(640, y); ctx.stroke();
      }

      ctx.fillStyle = color;
      ctx.fillRect(100, 70, 440, 340);

      ctx.fillStyle = '#020617';
      ctx.fillRect(140, 110, 360, 150);

      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 20px monospace';
      ctx.fillText("PRELEVEUR STEP 24H", 160, 150);

      ctx.fillStyle = '#4ade80';
      ctx.font = 'bold 26px monospace';
      ctx.fillText("T° CONSERV : 3.8 °C", 160, 195);

      ctx.fillStyle = '#fde047';
      ctx.font = '16px monospace';
      ctx.fillText("24 PRELEVEMENTS / 24 ASSURES", 160, 235);

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 20px sans-serif';
      ctx.fillText(title, 140, 310);

      ctx.fillStyle = '#94a3b8';
      ctx.font = '14px sans-serif';
      ctx.fillText(`Horodatage certifié : ${today} à ${defaultHour}`, 140, 345);
      ctx.fillText("Échantillon réfrigéré conforme 2°C - 5°C", 140, 370);

      return c.toDataURL('image/jpeg', 0.85);
    };

    setFormData({
      nomStep: "STEP Val de Loire Métropole (45 000 EH)",
      dateAutosurveillance: today,
      technicienNom: "L. Juillien",
      meteo: "Soleil",
      observations: "Fonctionnement nominal des préleveurs asservis au débit 24h. Aspect du rejet limpide en sortie de clarificateur secondaire. Températures de conservation conformes.",
      entreeHasDebimetre: true,
      entreeDebit: "4850.5",
      entreeTempsMarchePompes: "18.2",
      entreeDebitPompeNominal: "260",
      entreeDebitEstime: "4732.0",
      sortieHasDebimetre: true,
      sortieDebit: "4620.0",
      sortieTempsMarchePompes: "17.8",
      sortieDebitPompeNominal: "255",
      sortieDebitEstime: "4539.0",
      presencePreleveur: true,
      preleveurType: "ISO monoflacon dépression",
      preleveurAsservissement: "débit",
      preleveurFrequenceDebit: "10",
      preleveurFrequenceTemps: "15",
      entreeDate: today,
      entreeHeure: defaultHour,
      entreeTemperature: "3.8",
      entreePhoto: generateSampleCanvas("PHOTO : PRELEVEUR ENTREE", "#0369a1"),
      entreePhotoNom: "preleveur_entree_24h.jpg",
      sortieDate: today,
      sortieHeure: defaultHour,
      sortieTemperature: "3.5",
      sortiePhoto: generateSampleCanvas("PHOTO : PRELEVEUR SORTIE", "#047857"),
      sortiePhotoNom: "preleveur_sortie_24h.jpg",
      destinataireEmail: "autosurveillance@grand-bassin.fr",
    });
    setErrors({});
  };

  const handleReset = () => {
    if (confirm("Réinitialiser le formulaire d'autosurveillance ?")) {
      localStorage.removeItem(STORAGE_KEY);
      setFormData({
        nomStep: '',
        dateAutosurveillance: today,
        technicienNom: '',
        meteo: 'Soleil',
        observations: '',
        entreeHasDebimetre: true,
        entreeDebit: '',
        entreeTempsMarchePompes: '',
        entreeDebitPompeNominal: '',
        entreeDebitEstime: '',
        sortieHasDebimetre: true,
        sortieDebit: '',
        sortieTempsMarchePompes: '',
        sortieDebitPompeNominal: '',
        sortieDebitEstime: '',
        presencePreleveur: true,
        preleveurType: 'ISO monoflacon dépression',
        preleveurAsservissement: 'débit',
        preleveurFrequenceDebit: '10',
        preleveurFrequenceTemps: '15',
        entreeDate: today,
        entreeHeure: defaultHour,
        entreeTemperature: '',
        entreePhoto: null,
        entreePhotoNom: '',
        sortieDate: today,
        sortieHeure: defaultHour,
        sortieTemperature: '',
        sortiePhoto: null,
        sortiePhotoNom: '',
        destinataireEmail: '',
      });
      setErrors({});
    }
  };

  const hasBothDebits = formData.entreeDebit && formData.sortieDebit && !isNaN(Number(formData.entreeDebit)) && !isNaN(Number(formData.sortieDebit)) && Number(formData.entreeDebit) > 0;
  const debitRatio = hasBothDebits ? ((Number(formData.sortieDebit) / Number(formData.entreeDebit)) * 100).toFixed(1) : null;
  const debitDelta = hasBothDebits ? (Number(formData.sortieDebit) - Number(formData.entreeDebit)).toFixed(1) : null;

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800 flex flex-col font-sans selection:bg-sky-500 selection:text-white pb-12">

      {/* En-tête Principal de l'Application */}
      <header className="bg-slate-900 text-white shadow-md border-b border-slate-800 sticky top-0 z-30">
        <div className="max-w-4xl mx-auto px-4 py-3 sm:py-3.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-tr from-sky-500 to-emerald-400 flex items-center justify-center text-white shadow-md shadow-sky-500/20">
              <Droplets className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-extrabold tracking-tight text-white flex items-center gap-1.5">
                <span>Autosurveillance STEP</span>
                <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-sky-950 text-sky-400 border border-sky-800">
                  Terrain
                </span>
              </h1>
              <p className="text-[11px] text-slate-400 flex items-center gap-1.5">
                <span>Contrôle réglementaire 24h</span>
                <span>•</span>
                <span className="text-emerald-400 font-medium flex items-center gap-1">
                  <Share2 className="w-3 h-3" /> Partage WhatsApp &amp; Mail
                </span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleLoadSample}
              className="text-xs bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-slate-200 px-3 py-2 rounded-xl font-medium transition border border-slate-700 flex items-center gap-1.5 shadow-sm cursor-pointer"
              title="Pré-remplir avec des données d'exemple"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden sm:inline">Exemple</span>
            </button>

            <button
              type="button"
              onClick={() => setShowHtmlExportModal(true)}
              className="text-xs bg-sky-950 hover:bg-sky-900 active:bg-sky-800 text-sky-200 px-3 py-2 rounded-xl font-medium transition border border-sky-800/80 flex items-center gap-1.5 shadow-sm cursor-pointer"
              title="Code HTML autonome"
            >
              <FileCode className="w-3.5 h-3.5 text-sky-300" />
              <span className="hidden md:inline">Fichier HTML</span>
            </button>

            <button
              type="button"
              onClick={handleReset}
              className="text-xs text-rose-300 hover:text-rose-200 bg-rose-950/40 hover:bg-rose-900/50 p-2 rounded-xl border border-rose-800/60 transition cursor-pointer"
              title="Réinitialiser"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Contenu Principal Formulaire */}
      <main className="max-w-4xl mx-auto w-full px-3.5 sm:px-6 py-6 flex-1 space-y-6">

        {/* Bannière de confirmation et de partage immédiat WhatsApp & Email */}
        {generatedPdf && (
          <div className="bg-emerald-50 border border-emerald-300 rounded-2xl p-4 sm:p-5 text-emerald-950 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 animate-in fade-in duration-200">
            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-emerald-500 text-white flex items-center justify-center shrink-0 shadow-sm">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-sm sm:text-base font-extrabold text-emerald-900 flex items-center gap-2">
                  <span>✓ Rapport PDF généré et téléchargé sur l'appareil !</span>
                </h3>
                <p className="text-xs text-emerald-800 mt-1">
                  Station : <strong>{formData.nomStep}</strong> • Prêt pour envoi immédiat sur WhatsApp ou par e-mail.
                </p>
                <div className="flex flex-wrap items-center gap-3 mt-2 text-[11px] text-emerald-700 font-medium">
                  <span>Fichier : <strong>{generatedPdf.fileName}</strong></span>
                  <span>•</span>
                  <span>Photos horodatées intégrées</span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto shrink-0">
              <button
                type="button"
                onClick={handleShareWhatsApp}
                className="flex-1 sm:flex-none px-3.5 py-2.5 bg-[#25D366] hover:bg-[#20ba59] active:bg-[#1caa4f] text-white font-bold rounded-xl text-xs transition cursor-pointer shadow-sm flex items-center justify-center gap-1.5"
                title="Partager sur WhatsApp"
              >
                <MessageCircle className="w-4 h-4 fill-white" />
                <span>WhatsApp</span>
              </button>
              <button
                type="button"
                onClick={handleSendEmail}
                className="flex-1 sm:flex-none px-3.5 py-2.5 bg-sky-600 hover:bg-sky-500 active:bg-sky-700 text-white font-bold rounded-xl text-xs transition cursor-pointer shadow-sm flex items-center justify-center gap-1.5"
                title="Envoyer par e-mail"
              >
                <Mail className="w-4 h-4" />
                <span>E-mail</span>
              </button>
              <button
                type="button"
                onClick={() => setShowPdfModal(true)}
                className="px-3.5 py-2.5 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl text-xs transition cursor-pointer shadow-sm flex items-center justify-center gap-1.5"
                title="Aperçu interactif du PDF"
              >
                <FileText className="w-4 h-4" />
                <span>Aperçu PDF</span>
              </button>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6" noValidate>

          {/* 1. INFORMATIONS GÉNÉRALES */}
          <section className="bg-white rounded-2xl p-4 sm:p-6 shadow-sm border border-slate-200">
            <div className="flex items-center gap-2.5 pb-3 mb-4 border-b border-slate-100">
              <div className="w-7 h-7 rounded-lg bg-sky-100 text-sky-700 flex items-center justify-center font-bold text-sm">
                1
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-bold text-slate-900">
                  En-tête &amp; Informations Générales
                </h2>
                <p className="text-xs text-slate-500">Identification de l'ouvrage et date du contrôle</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="nomStep" className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Nom de la Station d'Épuration (STEP) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  id="nomStep"
                  value={formData.nomStep}
                  onChange={(e) => handleChange('nomStep', e.target.value)}
                  placeholder="ex: STEP des Trois Rivières (30 000 EH)"
                  className={`w-full px-3.5 py-2.5 text-sm sm:text-base rounded-xl border ${
                    errors.nomStep ? 'border-rose-500 bg-rose-50/40 text-rose-900' : 'border-slate-300 bg-slate-50/50'
                  } focus:outline-none focus:ring-2 focus:ring-sky-500 transition`}
                />
                {errors.nomStep && (
                  <p className="text-xs text-rose-500 font-medium mt-1 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5" /> {errors.nomStep}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="dateAutosurveillance" className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Date de l'Autosurveillance <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="date"
                    id="dateAutosurveillance"
                    value={formData.dateAutosurveillance}
                    onChange={(e) => handleChange('dateAutosurveillance', e.target.value)}
                    className={`w-full pl-3.5 pr-10 py-2.5 text-sm sm:text-base rounded-xl border ${
                      errors.dateAutosurveillance ? 'border-rose-500 bg-rose-50/40' : 'border-slate-300 bg-slate-50/50'
                    } focus:outline-none focus:ring-2 focus:ring-sky-500`}
                  />
                  <Calendar className="w-4 h-4 text-slate-400 absolute right-3.5 top-3 pointer-events-none" />
                </div>
                {errors.dateAutosurveillance && (
                  <p className="text-xs text-rose-500 font-medium mt-1">{errors.dateAutosurveillance}</p>
                )}
              </div>

              <div>
                <label htmlFor="technicienNom" className="block text-xs font-semibold text-slate-600 mb-1 flex items-center gap-1">
                  <UserIcon className="w-3.5 h-3.5 text-slate-400" />
                  <span>Technicien de traitement <span className="text-slate-400 text-[11px] font-normal">(optionnel)</span></span>
                </label>
                <input
                  type="text"
                  id="technicienNom"
                  value={formData.technicienNom}
                  onChange={(e) => handleChange('technicienNom', e.target.value)}
                  placeholder="ex: Laurent Juillien"
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-300 bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div>
                <label htmlFor="meteo" className="block text-xs font-semibold text-slate-600 mb-1 flex items-center gap-1">
                  <CloudSun className="w-3.5 h-3.5 text-slate-400" />
                  <span>Conditions météo sur 24h <span className="text-slate-400 text-[11px] font-normal">(optionnel)</span></span>
                </label>
                <select
                  id="meteo"
                  value={formData.meteo || 'Soleil'}
                  onChange={(e) => handleChange('meteo', e.target.value)}
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-300 bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-sky-500 cursor-pointer text-slate-800 font-medium"
                >
                  <option value="Soleil">Soleil</option>
                  <option value="Pluie">Pluie</option>
                  <option value="Neige">Neige</option>
                  <option value="Orage">Orage</option>
                </select>
              </div>
            </div>
          </section>

          {/* 2 & 3. BILANS ENTRÉE & SORTIE (Côte à côte sur grand écran) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

            {/* 2. BILAN ENTRÉE */}
            <section className="bg-white rounded-2xl p-4 sm:p-5 shadow-sm border border-slate-200 border-t-4 border-t-sky-500 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-2.5 mb-3.5 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-lg bg-sky-100 text-sky-800 flex items-center justify-center font-bold text-xs">
                      2
                    </span>
                    <h2 className="text-sm sm:text-base font-bold text-slate-900">
                      Bilan Entrée (Eaux Brutes)
                    </h2>
                  </div>
                  <span className="text-[11px] font-semibold text-sky-600 bg-sky-50 px-2 py-0.5 rounded-full border border-sky-200">
                    Prélèvement Entrée
                  </span>
                </div>

                <div className="space-y-3.5">
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label htmlFor="entreeDate" className="block text-xs font-semibold text-slate-700 mb-1">
                        Date prélèvement <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="date"
                        id="entreeDate"
                        value={formData.entreeDate}
                        onChange={(e) => handleChange('entreeDate', e.target.value)}
                        className={`w-full px-2.5 py-2 text-xs sm:text-sm rounded-xl border ${
                          errors.entreeDate ? 'border-rose-500 bg-rose-50/40' : 'border-slate-300 bg-slate-50/50'
                        } focus:outline-none focus:ring-2 focus:ring-sky-500`}
                      />
                    </div>
                    <div>
                      <label htmlFor="entreeHeure" className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1">
                        <Clock className="w-3 h-3 text-slate-400" />
                        <span>Heure de relève <span className="text-rose-500">*</span></span>
                      </label>
                      <input
                        type="time"
                        id="entreeHeure"
                        value={formData.entreeHeure}
                        onChange={(e) => handleChange('entreeHeure', e.target.value)}
                        className={`w-full px-2.5 py-2 text-xs sm:text-sm rounded-xl border ${
                          errors.entreeHeure ? 'border-rose-500 bg-rose-50/40' : 'border-slate-300 bg-slate-50/50'
                        } focus:outline-none focus:ring-2 focus:ring-sky-500`}
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="entreeTemperature" className="block text-xs font-semibold text-slate-700 mb-1 flex items-center justify-between">
                      <span className="flex items-center gap-1">
                        <Thermometer className="w-3.5 h-3.5 text-sky-600" />
                        <span>{formData.presencePreleveur ? "Température au préleveur (°C)" : "Température de l'eau prélevée (°C)"} <span className="text-rose-500">*</span></span>
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {formData.presencePreleveur ? "Cible : [2°C à 5°C]" : "Mesure directe eau"}
                      </span>
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        step="0.1"
                        id="entreeTemperature"
                        value={formData.entreeTemperature}
                        onChange={(e) => handleChange('entreeTemperature', e.target.value)}
                        placeholder={formData.presencePreleveur ? "ex: 3.8" : "ex: 14.5"}
                        className={`w-full pl-3.5 pr-12 py-2.5 text-sm rounded-xl font-mono border ${
                          errors.entreeTemperature ? 'border-rose-500 bg-rose-50/40' : 'border-slate-300 bg-slate-50/50'
                        } focus:outline-none focus:ring-2 focus:ring-sky-500`}
                      />
                      <span className="absolute right-3.5 top-2.5 text-xs font-bold text-slate-400">°C</span>
                    </div>
                    {errors.entreeTemperature && <p className="text-[11px] text-rose-500 mt-1">{errors.entreeTemperature}</p>}
                  </div>

                  {/* Débitmètre Entrée : Présence & Mesure / Estimation */}
                  <div className="p-3 bg-sky-50/70 border border-sky-200 rounded-xl space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-sky-900 flex items-center gap-1.5">
                        <Gauge className="w-3.5 h-3.5 text-sky-600" />
                        <span>Débitmètre en Entrée ? <span className="text-rose-500">*</span></span>
                      </span>
                      <div className="inline-flex rounded-lg border border-sky-300 p-0.5 bg-white shadow-xs">
                        <button
                          type="button"
                          onClick={() => handleChange('entreeHasDebimetre', true)}
                          className={`px-2.5 py-1 text-xs font-bold rounded-md transition cursor-pointer ${
                            formData.entreeHasDebimetre
                              ? 'bg-sky-600 text-white shadow-xs'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          OUI
                        </button>
                        <button
                          type="button"
                          onClick={() => handleChange('entreeHasDebimetre', false)}
                          className={`px-2.5 py-1 text-xs font-bold rounded-md transition cursor-pointer ${
                            !formData.entreeHasDebimetre
                              ? 'bg-sky-600 text-white shadow-xs'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          NON
                        </button>
                      </div>
                    </div>

                    {formData.entreeHasDebimetre ? (
                      <div>
                        <label htmlFor="entreeDebit" className="block text-[11px] font-semibold text-slate-700 mb-1">
                          Débit cumulé passé sur 24 heures (m³) <span className="text-rose-500">*</span>
                        </label>
                        <div className="relative">
                          <input
                            type="number"
                            step="0.1"
                            min="0"
                            id="entreeDebit"
                            value={formData.entreeDebit}
                            onChange={(e) => handleChange('entreeDebit', e.target.value)}
                            placeholder="ex: 4850.5"
                            className={`w-full pl-3.5 pr-12 py-2 text-xs sm:text-sm rounded-xl font-mono border ${
                              errors.entreeDebit ? 'border-rose-500 bg-rose-50/40' : 'border-slate-300 bg-white'
                            } focus:outline-none focus:ring-2 focus:ring-sky-500`}
                          />
                          <span className="absolute right-3.5 top-2 text-xs font-bold text-slate-400">m³</span>
                        </div>
                        {errors.entreeDebit && <p className="text-[11px] text-rose-500 mt-1">{errors.entreeDebit}</p>}
                      </div>
                    ) : (
                      <div className="space-y-2 pt-1 border-t border-sky-200">
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label htmlFor="entreeTempsMarchePompes" className="block text-[11px] font-semibold text-slate-700 mb-1">
                              Temps de marche pompes (h) <span className="text-rose-500">*</span>
                            </label>
                            <input
                              type="number"
                              step="0.1"
                              min="0"
                              id="entreeTempsMarchePompes"
                              value={formData.entreeTempsMarchePompes || ''}
                              onChange={(e) => handleChange('entreeTempsMarchePompes', e.target.value)}
                              placeholder="ex: 14.5"
                              className={`w-full px-2.5 py-1.5 text-xs rounded-xl font-mono border ${
                                errors.entreeTempsMarchePompes ? 'border-rose-500 bg-rose-50/40' : 'border-slate-300 bg-white'
                              } focus:outline-none focus:ring-2 focus:ring-sky-500`}
                            />
                            {errors.entreeTempsMarchePompes && <p className="text-[10px] text-rose-500 mt-0.5">{errors.entreeTempsMarchePompes}</p>}
                          </div>
                          <div>
                            <label htmlFor="entreeDebitPompeNominal" className="block text-[11px] font-semibold text-slate-700 mb-1">
                              Débit pompe unitaire (m³/h)
                            </label>
                            <input
                              type="number"
                              step="0.1"
                              min="0"
                              id="entreeDebitPompeNominal"
                              value={formData.entreeDebitPompeNominal || ''}
                              onChange={(e) => handleChange('entreeDebitPompeNominal', e.target.value)}
                              placeholder="ex: 120"
                              className="w-full px-2.5 py-1.5 text-xs rounded-xl font-mono border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                            />
                          </div>
                        </div>

                        <div>
                          <label htmlFor="entreeDebit" className="block text-[11px] font-semibold text-slate-700 mb-1 flex items-center justify-between">
                            <span>Estimation du débit calculée (m³) <span className="text-rose-500">*</span></span>
                            <span className="text-[10px] text-sky-700 font-medium">Temps × Débit pompe</span>
                          </label>
                          <div className="relative">
                            <input
                              type="number"
                              step="0.1"
                              min="0"
                              id="entreeDebit"
                              value={formData.entreeDebit}
                              onChange={(e) => handleChange('entreeDebit', e.target.value)}
                              placeholder="Calculé automatiquement"
                              className={`w-full pl-3.5 pr-12 py-2 text-xs sm:text-sm rounded-xl font-mono font-bold text-sky-950 border ${
                                errors.entreeDebit ? 'border-rose-500 bg-rose-50/40' : 'border-sky-300 bg-sky-50/50'
                              } focus:outline-none focus:ring-2 focus:ring-sky-500`}
                            />
                            <span className="absolute right-3.5 top-2 text-xs font-bold text-slate-400">m³</span>
                          </div>
                          {errors.entreeDebit && <p className="text-[11px] text-rose-500 mt-1">{errors.entreeDebit}</p>}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Capture Photo Entrée */}
                  <div className="pt-2">
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                      <span className="flex items-center gap-1">
                        <Camera className="w-4 h-4 text-sky-600" />
                        <span>Photo Préleveur Entrée <span className="text-rose-500">*</span></span>
                      </span>
                      <span className="text-[11px] text-sky-700 font-medium">Caméra terrain</span>
                    </label>

                    <input
                      ref={entreeFileInputRef}
                      type="file"
                      id="entreePhotoInput"
                      accept="image/*"
                      capture="environment"
                      onChange={(e) => {
                        if (e.target.files && e.target.files[0]) {
                          handlePhotoUpload(e.target.files[0], 'entree');
                        }
                      }}
                      className="hidden"
                    />

                    {formData.entreePhoto ? (
                      <div className="relative group rounded-xl overflow-hidden border border-sky-300 bg-slate-900 shadow-sm">
                        <img
                          src={formData.entreePhoto}
                          alt="Prévisualisation Entrée"
                          className="w-full h-44 object-cover cursor-pointer"
                          onClick={() => setShowPhotoModal({ title: "Photo Préleveur Entrée", src: formData.entreePhoto! })}
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                          <button
                            type="button"
                            onClick={() => setShowPhotoModal({ title: "Photo Préleveur Entrée", src: formData.entreePhoto! })}
                            className="p-2 rounded-full bg-white/90 text-slate-900 hover:bg-white text-xs font-bold flex items-center gap-1 cursor-pointer"
                          >
                            <Eye className="w-4 h-4" /> Agrandir
                          </button>
                          <button
                            type="button"
                            onClick={() => removePhoto('entree')}
                            className="p-2 rounded-full bg-rose-600/90 text-white hover:bg-rose-600 text-xs font-bold flex items-center gap-1 cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" /> Supprimer
                          </button>
                        </div>
                        <div className="absolute bottom-0 inset-x-0 bg-slate-900/80 backdrop-blur-xs p-1.5 text-[11px] text-slate-200 flex items-center justify-between">
                          <span className="truncate max-w-[180px]">{formData.entreePhotoNom || 'photo_entree.jpg'}</span>
                          <span className="text-emerald-400 font-semibold flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" /> Photo prête
                          </span>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => entreeFileInputRef.current?.click()}
                        className={`w-full py-6 px-4 rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-2 cursor-pointer transition active:scale-[0.99] ${
                          errors.entreePhoto ? 'border-rose-400 bg-rose-50/50 text-rose-700' : 'border-sky-300 hover:border-sky-500 bg-sky-50/50 hover:bg-sky-50 text-sky-800'
                        }`}
                      >
                        <div className="w-10 h-10 rounded-full bg-sky-100 flex items-center justify-center text-sky-600">
                          <Camera className="w-5 h-5" />
                        </div>
                        <span className="text-xs font-bold">Prendre la photo Entrée</span>
                        <span className="text-[10px] text-slate-500">Appareil photo ou fichier</span>
                      </button>
                    )}
                    {errors.entreePhoto && (
                      <p className="text-xs text-rose-500 font-medium mt-1 flex items-center gap-1">
                        <AlertCircle className="w-3.5 h-3.5" /> {errors.entreePhoto}
                      </p>
                    )}
                  </div>

                </div>
              </div>
            </section>

            {/* 3. BILAN SORTIE */}
            <section className="bg-white rounded-2xl p-4 sm:p-5 shadow-sm border border-slate-200 border-t-4 border-t-emerald-500 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-2.5 mb-3.5 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-xs">
                      3
                    </span>
                    <h2 className="text-sm sm:text-base font-bold text-slate-900">
                      Bilan Sortie (Rejet Traité)
                    </h2>
                  </div>
                  <span className="text-[11px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                    Prélèvement Sortie
                  </span>
                </div>

                <div className="space-y-3.5">
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label htmlFor="sortieDate" className="block text-xs font-semibold text-slate-700 mb-1">
                        Date prélèvement <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="date"
                        id="sortieDate"
                        value={formData.sortieDate}
                        onChange={(e) => handleChange('sortieDate', e.target.value)}
                        className={`w-full px-2.5 py-2 text-xs sm:text-sm rounded-xl border ${
                          errors.sortieDate ? 'border-rose-500 bg-rose-50/40' : 'border-slate-300 bg-slate-50/50'
                        } focus:outline-none focus:ring-2 focus:ring-emerald-500`}
                      />
                    </div>
                    <div>
                      <label htmlFor="sortieHeure" className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1">
                        <Clock className="w-3 h-3 text-slate-400" />
                        <span>Heure de relève <span className="text-rose-500">*</span></span>
                      </label>
                      <input
                        type="time"
                        id="sortieHeure"
                        value={formData.sortieHeure}
                        onChange={(e) => handleChange('sortieHeure', e.target.value)}
                        className={`w-full px-2.5 py-2 text-xs sm:text-sm rounded-xl border ${
                          errors.sortieHeure ? 'border-rose-500 bg-rose-50/40' : 'border-slate-300 bg-slate-50/50'
                        } focus:outline-none focus:ring-2 focus:ring-emerald-500`}
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="sortieTemperature" className="block text-xs font-semibold text-slate-700 mb-1 flex items-center justify-between">
                      <span className="flex items-center gap-1">
                        <Thermometer className="w-3.5 h-3.5 text-emerald-600" />
                        <span>{formData.presencePreleveur ? "Température au préleveur (°C)" : "Température de l'eau prélevée (°C)"} <span className="text-rose-500">*</span></span>
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {formData.presencePreleveur ? "Cible : [2°C à 5°C]" : "Mesure directe eau"}
                      </span>
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        step="0.1"
                        id="sortieTemperature"
                        value={formData.sortieTemperature}
                        onChange={(e) => handleChange('sortieTemperature', e.target.value)}
                        placeholder={formData.presencePreleveur ? "ex: 3.5" : "ex: 13.8"}
                        className={`w-full pl-3.5 pr-12 py-2.5 text-sm rounded-xl font-mono border ${
                          errors.sortieTemperature ? 'border-rose-500 bg-rose-50/40' : 'border-slate-300 bg-slate-50/50'
                        } focus:outline-none focus:ring-2 focus:ring-emerald-500`}
                      />
                      <span className="absolute right-3.5 top-2.5 text-xs font-bold text-slate-400">°C</span>
                    </div>
                    {errors.sortieTemperature && <p className="text-[11px] text-rose-500 mt-1">{errors.sortieTemperature}</p>}
                  </div>

                  {/* Débitmètre Sortie : Présence & Mesure / Estimation */}
                  <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-emerald-950 flex items-center gap-1.5">
                        <Gauge className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Débitmètre en Sortie ? <span className="text-rose-500">*</span></span>
                      </span>
                      <div className="inline-flex rounded-lg border border-emerald-300 p-0.5 bg-white shadow-xs">
                        <button
                          type="button"
                          onClick={() => handleChange('sortieHasDebimetre', true)}
                          className={`px-2.5 py-1 text-xs font-bold rounded-md transition cursor-pointer ${
                            formData.sortieHasDebimetre
                              ? 'bg-emerald-600 text-white shadow-xs'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          OUI
                        </button>
                        <button
                          type="button"
                          onClick={() => handleChange('sortieHasDebimetre', false)}
                          className={`px-2.5 py-1 text-xs font-bold rounded-md transition cursor-pointer ${
                            !formData.sortieHasDebimetre
                              ? 'bg-emerald-600 text-white shadow-xs'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          NON
                        </button>
                      </div>
                    </div>

                    {formData.sortieHasDebimetre ? (
                      <div>
                        <label htmlFor="sortieDebit" className="block text-[11px] font-semibold text-slate-700 mb-1">
                          Débit cumulé passé sur 24 heures (m³) <span className="text-rose-500">*</span>
                        </label>
                        <div className="relative">
                          <input
                            type="number"
                            step="0.1"
                            min="0"
                            id="sortieDebit"
                            value={formData.sortieDebit}
                            onChange={(e) => handleChange('sortieDebit', e.target.value)}
                            placeholder="ex: 4620.0"
                            className={`w-full pl-3.5 pr-12 py-2 text-xs sm:text-sm rounded-xl font-mono border ${
                              errors.sortieDebit ? 'border-rose-500 bg-rose-50/40' : 'border-slate-300 bg-white'
                            } focus:outline-none focus:ring-2 focus:ring-emerald-500`}
                          />
                          <span className="absolute right-3.5 top-2 text-xs font-bold text-slate-400">m³</span>
                        </div>
                        {errors.sortieDebit && <p className="text-[11px] text-rose-500 mt-1">{errors.sortieDebit}</p>}
                      </div>
                    ) : (
                      <div className="space-y-2 pt-1 border-t border-emerald-200">
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label htmlFor="sortieTempsMarchePompes" className="block text-[11px] font-semibold text-slate-700 mb-1">
                              Temps de marche pompes (h) <span className="text-rose-500">*</span>
                            </label>
                            <input
                              type="number"
                              step="0.1"
                              min="0"
                              id="sortieTempsMarchePompes"
                              value={formData.sortieTempsMarchePompes || ''}
                              onChange={(e) => handleChange('sortieTempsMarchePompes', e.target.value)}
                              placeholder="ex: 13.0"
                              className={`w-full px-2.5 py-1.5 text-xs rounded-xl font-mono border ${
                                errors.sortieTempsMarchePompes ? 'border-rose-500 bg-rose-50/40' : 'border-slate-300 bg-white'
                              } focus:outline-none focus:ring-2 focus:ring-emerald-500`}
                            />
                            {errors.sortieTempsMarchePompes && <p className="text-[10px] text-rose-500 mt-0.5">{errors.sortieTempsMarchePompes}</p>}
                          </div>
                          <div>
                            <label htmlFor="sortieDebitPompeNominal" className="block text-[11px] font-semibold text-slate-700 mb-1">
                              Débit pompe unitaire (m³/h)
                            </label>
                            <input
                              type="number"
                              step="0.1"
                              min="0"
                              id="sortieDebitPompeNominal"
                              value={formData.sortieDebitPompeNominal || ''}
                              onChange={(e) => handleChange('sortieDebitPompeNominal', e.target.value)}
                              placeholder="ex: 110"
                              className="w-full px-2.5 py-1.5 text-xs rounded-xl font-mono border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                            />
                          </div>
                        </div>

                        <div>
                          <label htmlFor="sortieDebit" className="block text-[11px] font-semibold text-slate-700 mb-1 flex items-center justify-between">
                            <span>Estimation du débit calculée (m³) <span className="text-rose-500">*</span></span>
                            <span className="text-[10px] text-emerald-700 font-medium">Temps × Débit pompe</span>
                          </label>
                          <div className="relative">
                            <input
                              type="number"
                              step="0.1"
                              min="0"
                              id="sortieDebit"
                              value={formData.sortieDebit}
                              onChange={(e) => handleChange('sortieDebit', e.target.value)}
                              placeholder="Calculé automatiquement"
                              className={`w-full pl-3.5 pr-12 py-2 text-xs sm:text-sm rounded-xl font-mono font-bold text-emerald-950 border ${
                                errors.sortieDebit ? 'border-rose-500 bg-rose-50/40' : 'border-emerald-300 bg-emerald-50/50'
                              } focus:outline-none focus:ring-2 focus:ring-emerald-500`}
                            />
                            <span className="absolute right-3.5 top-2 text-xs font-bold text-slate-400">m³</span>
                          </div>
                          {errors.sortieDebit && <p className="text-[11px] text-rose-500 mt-1">{errors.sortieDebit}</p>}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Capture Photo Sortie */}
                  <div className="pt-2">
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                      <span className="flex items-center gap-1">
                        <Camera className="w-4 h-4 text-emerald-600" />
                        <span>Photo Préleveur Sortie <span className="text-rose-500">*</span></span>
                      </span>
                      <span className="text-[11px] text-emerald-700 font-medium">Caméra terrain</span>
                    </label>

                    <input
                      ref={sortieFileInputRef}
                      type="file"
                      id="sortiePhotoInput"
                      accept="image/*"
                      capture="environment"
                      onChange={(e) => {
                        if (e.target.files && e.target.files[0]) {
                          handlePhotoUpload(e.target.files[0], 'sortie');
                        }
                      }}
                      className="hidden"
                    />

                    {formData.sortiePhoto ? (
                      <div className="relative group rounded-xl overflow-hidden border border-emerald-300 bg-slate-900 shadow-sm">
                        <img
                          src={formData.sortiePhoto}
                          alt="Prévisualisation Sortie"
                          className="w-full h-44 object-cover cursor-pointer"
                          onClick={() => setShowPhotoModal({ title: "Photo Préleveur Sortie", src: formData.sortiePhoto! })}
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                          <button
                            type="button"
                            onClick={() => setShowPhotoModal({ title: "Photo Préleveur Sortie", src: formData.sortiePhoto! })}
                            className="p-2 rounded-full bg-white/90 text-slate-900 hover:bg-white text-xs font-bold flex items-center gap-1 cursor-pointer"
                          >
                            <Eye className="w-4 h-4" /> Agrandir
                          </button>
                          <button
                            type="button"
                            onClick={() => removePhoto('sortie')}
                            className="p-2 rounded-full bg-rose-600/90 text-white hover:bg-rose-600 text-xs font-bold flex items-center gap-1 cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" /> Supprimer
                          </button>
                        </div>
                        <div className="absolute bottom-0 inset-x-0 bg-slate-900/80 backdrop-blur-xs p-1.5 text-[11px] text-slate-200 flex items-center justify-between">
                          <span className="truncate max-w-[180px]">{formData.sortiePhotoNom || 'photo_sortie.jpg'}</span>
                          <span className="text-emerald-400 font-semibold flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" /> Photo prête
                          </span>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => sortieFileInputRef.current?.click()}
                        className={`w-full py-6 px-4 rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-2 cursor-pointer transition active:scale-[0.99] ${
                          errors.sortiePhoto ? 'border-rose-400 bg-rose-50/50 text-rose-700' : 'border-emerald-300 hover:border-emerald-500 bg-emerald-50/50 hover:bg-emerald-50 text-emerald-800'
                        }`}
                      >
                        <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600">
                          <Camera className="w-5 h-5" />
                        </div>
                        <span className="text-xs font-bold">Prendre la photo Sortie</span>
                        <span className="text-[10px] text-slate-500">Appareil photo ou fichier</span>
                      </button>
                    )}
                    {errors.sortiePhoto && (
                      <p className="text-xs text-rose-500 font-medium mt-1 flex items-center gap-1">
                        <AlertCircle className="w-3.5 h-3.5" /> {errors.sortiePhoto}
                      </p>
                    )}
                  </div>

                </div>
              </div>
            </section>

          </div>

          {/* SECTION D'ANALYSE SPÉCIFIQUE : ÉQUIPEMENTS PRÉLEVEURS & ASSERVISSEMENT */}
          <section className="bg-white rounded-2xl p-4 sm:p-5 shadow-sm border border-slate-200 border-t-4 border-t-indigo-600">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 mb-3.5 border-b border-slate-100 gap-2">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-indigo-100 text-indigo-800 flex items-center justify-center font-bold text-sm">
                  ⚙️
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-slate-900">
                    Section d'Analyse : Équipements Préleveurs &amp; Asservissement
                  </h3>
                  <p className="text-xs text-slate-500">
                    Paramètres réglementaires d'échantillonnage continu sur 24 heures
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-700">Présence de préleveur(s) :</span>
                <div className="inline-flex rounded-lg border border-slate-300 p-0.5 bg-slate-50">
                  <button
                    type="button"
                    onClick={() => handleChange('presencePreleveur', true)}
                    className={`px-3 py-1 text-xs font-bold rounded-md transition cursor-pointer ${
                      formData.presencePreleveur
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    OUI
                  </button>
                  <button
                    type="button"
                    onClick={() => handleChange('presencePreleveur', false)}
                    className={`px-3 py-1 text-xs font-bold rounded-md transition cursor-pointer ${
                      !formData.presencePreleveur
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    NON
                  </button>
                </div>
              </div>
            </div>

            {formData.presencePreleveur ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                {/* 1. Type de préleveur */}
                <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/60 space-y-2">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Type de préleveur <span className="text-rose-500">*</span>
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => handleChange('preleveurType', 'ISO monoflacon dépression')}
                      className={`p-2.5 rounded-xl border text-left text-xs font-semibold flex items-center gap-2 transition cursor-pointer ${
                        formData.preleveurType === 'ISO monoflacon dépression'
                          ? 'border-indigo-600 bg-indigo-50/80 text-indigo-950 shadow-xs ring-1 ring-indigo-600'
                          : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <div className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center shrink-0 ${
                        formData.preleveurType === 'ISO monoflacon dépression' ? 'border-indigo-600 bg-indigo-600' : 'border-slate-400'
                      }`}>
                        {formData.preleveurType === 'ISO monoflacon dépression' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                      </div>
                      <span>ISO monoflacon dépression</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleChange('preleveurType', 'péristaltique')}
                      className={`p-2.5 rounded-xl border text-left text-xs font-semibold flex items-center gap-2 transition cursor-pointer ${
                        formData.preleveurType === 'péristaltique'
                          ? 'border-indigo-600 bg-indigo-50/80 text-indigo-950 shadow-xs ring-1 ring-indigo-600'
                          : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <div className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center shrink-0 ${
                        formData.preleveurType === 'péristaltique' ? 'border-indigo-600 bg-indigo-600' : 'border-slate-400'
                      }`}>
                        {formData.preleveurType === 'péristaltique' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                      </div>
                      <span>Péristaltique</span>
                    </button>
                  </div>
                  {errors.preleveurType && <p className="text-xs text-rose-500 font-medium">{errors.preleveurType}</p>}
                </div>

                {/* 2. Asservissement & Fréquence */}
                <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/60 space-y-2">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Type d'asservissement &amp; Fréquence <span className="text-rose-500">*</span>
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => handleChange('preleveurAsservissement', 'débit')}
                      className={`p-2 rounded-xl border text-center text-xs font-semibold transition cursor-pointer ${
                        formData.preleveurAsservissement === 'débit'
                          ? 'border-indigo-600 bg-indigo-50/80 text-indigo-950 shadow-xs ring-1 ring-indigo-600'
                          : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      Asservissement Débit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleChange('preleveurAsservissement', 'temps')}
                      className={`p-2 rounded-xl border text-center text-xs font-semibold transition cursor-pointer ${
                        formData.preleveurAsservissement === 'temps'
                          ? 'border-indigo-600 bg-indigo-50/80 text-indigo-950 shadow-xs ring-1 ring-indigo-600'
                          : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      Asservissement Temps
                    </button>
                  </div>

                  {formData.preleveurAsservissement === 'débit' ? (
                    <div>
                      <label htmlFor="preleveurFrequenceDebit" className="block text-[11px] font-semibold text-slate-700 mb-1">
                        Fréquence au débit : <span className="text-slate-500 font-normal">Un prélèvement tous les :</span>
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          step="1"
                          min="1"
                          id="preleveurFrequenceDebit"
                          value={formData.preleveurFrequenceDebit || ''}
                          onChange={(e) => handleChange('preleveurFrequenceDebit', e.target.value)}
                          placeholder="ex: 10"
                          className="w-full pl-3 pr-14 py-2 text-xs rounded-xl font-mono border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                        <span className="absolute right-3 top-2 text-xs font-bold text-slate-400">m³</span>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <label htmlFor="preleveurFrequenceTemps" className="block text-[11px] font-semibold text-slate-700 mb-1">
                        Fréquence au temps : <span className="text-slate-500 font-normal">Un prélèvement toutes les :</span>
                      </label>
                      <div className="relative">
                        <select
                          id="preleveurFrequenceTemps"
                          value={formData.preleveurFrequenceTemps || '15'}
                          onChange={(e) => handleChange('preleveurFrequenceTemps', e.target.value)}
                          className="w-full px-3 py-2.5 text-xs sm:text-sm rounded-xl font-medium border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer shadow-xs text-slate-900"
                        >
                          <option value="5">Toutes les 5 minutes</option>
                          <option value="10">Toutes les 10 minutes</option>
                          <option value="15">Toutes les 15 minutes (Standard 24h)</option>
                          <option value="20">Toutes les 20 minutes</option>
                          <option value="30">Toutes les 30 minutes</option>
                          <option value="45">Toutes les 45 minutes</option>
                          <option value="60">Toutes les 60 minutes (1 heure)</option>
                          <option value="90">Toutes les 90 minutes (1h30)</option>
                          <option value="120">Toutes les 120 minutes (2 heures)</option>
                        </select>
                      </div>
                    </div>
                  )}
                  {errors.preleveurFrequence && <p className="text-xs text-rose-500 font-medium">{errors.preleveurFrequence}</p>}
                </div>
              </div>
            ) : (
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800">
                ⚠️ Absence de préleveurs automatiques déclarée : le rapport PDF mentionnera un mode d'échantillonnage manuel ponctuel.
              </div>
            )}
          </section>

          {/* Synthèse volumétrique & observations */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-1 bg-white rounded-2xl p-4 shadow-sm border border-slate-200 flex flex-col justify-center">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                Bilan Volumétrique 24h
              </span>
              {hasBothDebits ? (
                <div className="mt-2 space-y-1">
                  <div className="flex items-baseline justify-between">
                    <span className="text-xs text-slate-600">Ratio Sortie / Entrée :</span>
                    <span className="text-base font-bold font-mono text-slate-900">{debitRatio} %</span>
                  </div>
                  <div className="flex items-baseline justify-between text-xs text-slate-500">
                    <span>Écart de volume :</span>
                    <span className="font-mono font-medium text-slate-700">{debitDelta && Number(debitDelta) > 0 ? `+${debitDelta}` : debitDelta} m³</span>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-400 mt-2 italic">
                  Renseignez les débits Entrée et Sortie pour calculer le ratio.
                </p>
              )}
            </div>

            <div className="md:col-span-2 bg-white rounded-2xl p-4 shadow-sm border border-slate-200">
              <label htmlFor="observations" className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1 flex items-center justify-between">
                <span>Remarques / Événements d'exploitation <span className="text-slate-400 font-normal">(optionnel)</span></span>
                <span className="text-[10px] text-slate-400">Visible sur le rapport PDF</span>
              </label>
              <textarea
                id="observations"
                rows={2}
                value={formData.observations}
                onChange={(e) => handleChange('observations', e.target.value)}
                placeholder="Renseignez d'éventuelles observations (ex: aspect limpide du rejet, curage, conditions d'exploitation...)"
                className="w-full px-3 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500 bg-slate-50/50 resize-none text-slate-800"
              />
            </div>
          </div>

          {/* 4. GÉNÉRATION DU RAPPORT PDF & OPTIONS DE PARTAGE */}
          <section className="bg-gradient-to-br from-slate-900 to-slate-800 text-white rounded-2xl p-5 sm:p-6 shadow-xl border border-slate-700">
            <div className="flex items-center gap-2.5 pb-3 mb-4 border-b border-slate-700">
              <div className="w-7 h-7 rounded-lg bg-emerald-500 text-white flex items-center justify-center font-bold text-sm">
                4
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-bold text-white">
                  Génération du Rapport PDF &amp; Options de Partage
                </h2>
                <p className="text-xs text-slate-300">
                  Génération instantanée du rapport officiel avec photos horodatées, prêt pour envoi direct par WhatsApp ou par e-mail
                </p>
              </div>
            </div>

            <div className="space-y-4">
              {/* Carte des options de partage direct */}
              <div className="p-4 rounded-xl bg-slate-800/90 border border-slate-700 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-900/60 border border-slate-700/60">
                    <div className="w-9 h-9 rounded-lg bg-[#25D366]/20 text-[#25D366] flex items-center justify-center shrink-0">
                      <MessageCircle className="w-5 h-5 fill-[#25D366]" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                        <span>Partage WhatsApp</span>
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-950 text-emerald-400 border border-emerald-800 font-semibold">
                          Direct
                        </span>
                      </h4>
                      <p className="text-[11px] text-slate-300 mt-0.5 leading-snug">
                        Synthèse structurée prête à l'envoi + transmission du fichier PDF sur mobile ou WhatsApp Web.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-900/60 border border-slate-700/60">
                    <div className="w-9 h-9 rounded-lg bg-sky-500/20 text-sky-400 flex items-center justify-center shrink-0">
                      <Mail className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                        <span>Transmission E-mail</span>
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-sky-950 text-sky-400 border border-sky-800 font-semibold">
                          Mailto
                        </span>
                      </h4>
                      <p className="text-[11px] text-slate-300 mt-0.5 leading-snug">
                        Objet normalisé et corps de message récapitulatif complet pré-rempli dans votre messagerie.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Champ destinataire email optionnel */}
                <div className="pt-1">
                  <label htmlFor="destinataireEmail" className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Mail className="w-3.5 h-3.5 text-sky-400" />
                      <span>Adresse e-mail du destinataire</span>
                      <span className="text-slate-400 font-normal lowercase">(optionnel)</span>
                    </span>
                    <span className="text-[10px] text-slate-400">ex: exploitation, régie, agence</span>
                  </label>
                  <input
                    type="email"
                    id="destinataireEmail"
                    value={formData.destinataireEmail || ''}
                    onChange={(e) => handleChange('destinataireEmail', e.target.value)}
                    placeholder="ex: exploitation@grand-bassin.fr"
                    className="w-full px-3.5 py-2.5 text-xs sm:text-sm rounded-xl border border-slate-700 bg-slate-900/80 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 transition"
                  />
                </div>
              </div>

              {Object.keys(errors).length > 0 && (
                <div className="p-3.5 rounded-xl bg-rose-950/70 border border-rose-500/50 text-rose-200 text-xs">
                  <div className="flex items-center gap-2 font-bold mb-1">
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                    <span>Veuillez compléter les {Object.keys(errors).length} champ(s) obligatoire(s) :</span>
                  </div>
                  <ul className="list-disc list-inside space-y-0.5 text-rose-300 pl-1">
                    {Object.entries(errors).map(([key, msg]) => (
                      <li key={key}>{msg}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Bouton de validation tactile terrain */}
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={generationStep === 'generating_pdf' || generationStep === 'compressing'}
                  className="w-full py-4 px-6 rounded-xl font-extrabold text-base sm:text-lg bg-gradient-to-r from-emerald-500 via-teal-600 to-sky-600 hover:from-emerald-400 hover:to-sky-500 active:scale-[0.99] disabled:opacity-60 text-white shadow-lg shadow-emerald-600/30 flex items-center justify-center gap-3 transition cursor-pointer"
                >
                  {generationStep === 'generating_pdf' ? (
                    <>
                      <RefreshCw className="w-6 h-6 animate-spin text-white" />
                      <span>Génération du PDF officiel &amp; photos...</span>
                    </>
                  ) : (
                    <>
                      <FileText className="w-6 h-6" />
                      <span>Générer le Rapport PDF (Prêt pour WhatsApp &amp; Mail)</span>
                    </>
                  )}
                </button>
                <div className="flex flex-wrap items-center justify-center gap-3 text-xs text-slate-400 mt-2.5">
                  <span className="flex items-center gap-1 text-[#25D366]">
                    <MessageCircle className="w-3.5 h-3.5 fill-[#25D366]" />
                    <span>Partage direct WhatsApp</span>
                  </span>
                  <span>•</span>
                  <span className="flex items-center gap-1 text-sky-300">
                    <Mail className="w-3.5 h-3.5" />
                    <span>Envoi par e-mail</span>
                  </span>
                  <span>•</span>
                  <span className="flex items-center gap-1 text-slate-300">
                    <Download className="w-3.5 h-3.5" />
                    <span>Téléchargement direct</span>
                  </span>
                </div>
              </div>

              {/* Panneau d'actions directes Section 4 si rapport déjà généré */}
              {generatedPdf && (
                <div className="p-3.5 rounded-xl bg-slate-900 border border-emerald-500/60 space-y-2.5 animate-in fade-in">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-emerald-400 font-bold flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Rapport PDF prêt pour transmission :</span>
                    </span>
                    <span className="font-mono text-slate-300 truncate max-w-[200px]">
                      {generatedPdf.fileName}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                    <button
                      type="button"
                      onClick={handleShareWhatsApp}
                      className="py-2.5 px-3 bg-[#25D366] hover:bg-[#20ba59] active:bg-[#1caa4f] text-white font-bold rounded-xl flex items-center justify-center gap-2 text-xs transition cursor-pointer shadow-md"
                    >
                      <MessageCircle className="w-4 h-4 fill-white" />
                      <span>Envoyer via WhatsApp</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleSendEmail}
                      className="py-2.5 px-3 bg-sky-600 hover:bg-sky-500 active:bg-sky-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 text-xs transition cursor-pointer shadow-md"
                    >
                      <Mail className="w-4 h-4" />
                      <span>Envoyer par Email</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => downloadPdfBlob(generatedPdf.blob, generatedPdf.fileName)}
                      className="py-2.5 px-3 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 text-xs transition cursor-pointer border border-slate-700 shadow-md"
                    >
                      <Download className="w-4 h-4" />
                      <span>Télécharger le PDF</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </section>

        </form>

      </main>

      {/* PIED DE PAGE : MENTION OBLIGATOIRE "Créé par Laurent Juillien" */}
      <footer className="bg-white border-t border-slate-200 mt-auto py-5 px-4">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>Autosurveillance STEP • Fiche d'intervention terrain</span>
          </div>
          <div className="font-bold text-slate-800 text-sm">
            Créé par Laurent Juillien avec l'assistance de l'IA
          </div>
        </div>
      </footer>

      {/* MODAL SUCCESS / CONFIRMATION & APERÇU COMPLET DU PDF */}
      {showPdfModal && generatedPdf && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4">
          <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[95vh] flex flex-col shadow-2xl overflow-hidden border border-slate-300">
            {/* Header modal */}
            <div className="flex items-center justify-between p-4 bg-slate-900 text-white shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500 text-white flex items-center justify-center shrink-0 shadow">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                    <span>Rapport PDF Officiel Généré</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-900 text-emerald-300 font-normal">
                      Photos incluses
                    </span>
                  </h3>
                  <p className="text-xs text-slate-300 font-mono truncate max-w-[280px] sm:max-w-md">
                    {generatedPdf.fileName}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowPdfModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* BARRE D'ACTIONS DE PARTAGE DIRECT WHATSAPP & EMAIL */}
            <div className="p-4 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 border-b border-slate-700 text-white shrink-0">
              <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500 text-white flex items-center justify-center shrink-0 shadow-md">
                    <Share2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white flex items-center gap-2">
                      <span>Partager le Bilan Officiel</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-700">
                        Prêt
                      </span>
                    </h4>
                    <p className="text-xs text-slate-300">
                      Rapport téléchargé sur votre appareil. Choisissez votre mode de transmission :
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleShareWhatsApp}
                    className="flex-1 sm:flex-initial py-2.5 px-4 bg-[#25D366] hover:bg-[#20ba59] active:bg-[#1caa4f] text-white font-bold rounded-xl flex items-center justify-center gap-2 text-xs transition cursor-pointer shadow-md"
                    title="Envoyer le récapitulatif via WhatsApp"
                  >
                    <MessageCircle className="w-4 h-4 fill-white" />
                    <span>Envoyer via WhatsApp</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleSendEmail}
                    className="flex-1 sm:flex-initial py-2.5 px-4 bg-sky-600 hover:bg-sky-500 active:bg-sky-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 text-xs transition cursor-pointer shadow-md"
                    title="Envoyer par Email avec synthèse pré-remplie"
                  >
                    <Mail className="w-4 h-4" />
                    <span>Envoyer par Email</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleCopySummary}
                    className="py-2.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white font-medium rounded-xl flex items-center justify-center gap-1.5 text-xs transition border border-slate-700 cursor-pointer"
                    title="Copier le texte du récapitulatif"
                  >
                    {copiedSummary ? (
                      <>
                        <Check className="w-4 h-4 text-emerald-400" />
                        <span className="text-emerald-300 font-bold">Copié !</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4 text-slate-300" />
                        <span>Copier texte</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {shareFeedback && (
                <div className="mt-2.5 p-2 bg-emerald-950/70 border border-emerald-700 text-emerald-300 text-xs rounded-lg flex items-center gap-2 animate-in fade-in">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>{shareFeedback}</span>
                </div>
              )}

              {/* Volet déroulant aperçu du texte récapitulatif */}
              <div className="mt-3 pt-2.5 border-t border-slate-700/70">
                <button
                  type="button"
                  onClick={() => setShowSummaryPreview(!showSummaryPreview)}
                  className="text-xs text-sky-400 hover:text-sky-300 font-medium flex items-center gap-1.5 cursor-pointer"
                >
                  {showSummaryPreview ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  <span>{showSummaryPreview ? "Masquer le texte récapitulatif" : "Voir le récapitulatif envoyé dans le message"}</span>
                </button>

                {showSummaryPreview && (
                  <pre className="mt-2 p-3 bg-slate-950 rounded-xl border border-slate-800 text-[11px] text-slate-200 font-mono whitespace-pre-wrap max-h-48 overflow-y-auto leading-relaxed">
                    {generateReportSummary(formData, generatedPdf.fileName)}
                  </pre>
                )}
              </div>
            </div>

            {/* Ruban confirmation photos intégrées et téléchargement */}
            <div className="bg-slate-50 border-b border-slate-200 px-4 py-2 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-700 shrink-0">
              <div className="flex items-center gap-4">
                <span className="font-semibold text-slate-900">Photos intégrées au PDF :</span>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    {formData.entreePhoto ? (
                      <img src={formData.entreePhoto} alt="Entrée" className="w-5 h-5 rounded object-cover border border-sky-400" />
                    ) : null}
                    <span className="text-sky-700 font-medium">✓ Entrée</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {formData.sortiePhoto ? (
                      <img src={formData.sortiePhoto} alt="Sortie" className="w-5 h-5 rounded object-cover border border-emerald-400" />
                    ) : null}
                    <span className="text-emerald-700 font-medium">✓ Sortie</span>
                  </div>
                </div>
              </div>

              <div className="text-slate-500">
                Téléchargement local : <strong className="text-emerald-700">Enregistré dans vos téléchargements</strong>
              </div>
            </div>

            {/* Iframe aperçu interactif du PDF */}
            <div className="flex-1 min-h-[350px] sm:min-h-[440px] bg-slate-200 relative p-2">
              <iframe
                src={generatedPdf.blobUrl}
                title="Aperçu interactif du rapport PDF d'autosurveillance"
                className="w-full h-full rounded-xl border border-slate-300 bg-white shadow-inner"
              />
            </div>

            {/* Boutons d'action en bas de modale */}
            <div className="p-4 bg-white border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
              <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => downloadPdfBlob(generatedPdf.blob, generatedPdf.fileName)}
                  className="flex-1 sm:flex-initial py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 text-xs transition cursor-pointer shadow-sm"
                >
                  <Download className="w-4 h-4" />
                  <span>Télécharger le PDF</span>
                </button>

                <button
                  type="button"
                  onClick={handleShareWhatsApp}
                  className="flex-1 sm:flex-initial py-2.5 px-4 bg-[#25D366] hover:bg-[#20ba59] text-white font-bold rounded-xl flex items-center justify-center gap-2 text-xs transition cursor-pointer shadow-sm"
                >
                  <MessageCircle className="w-4 h-4 fill-white" />
                  <span>Envoyer via WhatsApp</span>
                </button>

                <button
                  type="button"
                  onClick={handleSendEmail}
                  className="flex-1 sm:flex-initial py-2.5 px-4 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded-xl flex items-center justify-center gap-2 text-xs transition cursor-pointer shadow-sm"
                >
                  <Mail className="w-4 h-4" />
                  <span>Envoyer par Email</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => setShowPdfModal(false)}
                className="text-xs text-slate-500 hover:text-slate-800 font-medium py-1 px-3 cursor-pointer"
              >
                Fermer l'aperçu
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL ENVOI E-MAIL AVEC FICHIER PDF EN PIÈCE JOINTE */}
      {showEmailModal && generatedPdf && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden border border-slate-300 animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="flex items-center justify-between p-4 bg-slate-900 text-white">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-sky-500 text-white flex items-center justify-center">
                  <Mail className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-bold">
                    Transmission par E-mail
                  </h3>
                  <p className="text-[11px] text-slate-300">
                    Envoi officiel avec pièce jointe PDF jointe
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowEmailModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 sm:p-5 space-y-4">
              {/* Badge Pièce jointe PDF obligatoire */}
              <div className="p-3 rounded-xl bg-sky-50 border border-sky-200 text-sky-950 flex items-start gap-2.5">
                <FileText className="w-5 h-5 text-sky-600 shrink-0 mt-0.5" />
                <div className="text-xs space-y-0.5">
                  <p className="font-bold text-sky-900 flex items-center gap-1.5">
                    <span>Pièce jointe PDF officielle incluse :</span>
                    <span className="text-[10px] bg-sky-200 text-sky-800 px-1.5 py-0.2 rounded font-mono">.PDF</span>
                  </p>
                  <p className="font-mono text-[11px] text-sky-800 break-all font-semibold">
                    {generatedPdf.fileName}
                  </p>
                  <p className="text-[10px] text-sky-600">
                    Le rapport complet d'autosurveillance 24h avec photos horodatées et paramètres d'exploitation sera joint directement au courriel.
                  </p>
                </div>
              </div>

              {/* Champ adresse e-mail */}
              <div>
                <label htmlFor="emailModalDest" className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Adresse e-mail du destinataire <span className="text-rose-500">*</span>
                </label>
                <input
                  type="email"
                  id="emailModalDest"
                  value={formData.destinataireEmail || ''}
                  onChange={(e) => handleChange('destinataireEmail', e.target.value)}
                  placeholder="ex: exploitation@grand-bassin.fr, service.assainissement@ville.fr"
                  className="w-full px-3 py-2 text-xs sm:text-sm rounded-xl border border-slate-300 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-sky-500 text-slate-900 font-medium"
                />
              </div>

              {/* Objet du mail */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-0.5">
                  Objet du message
                </label>
                <div className="px-3 py-1.5 rounded-lg bg-slate-100 border border-slate-200 text-xs text-slate-700 font-mono truncate">
                  [Autosurveillance STEP] Bilan 24h - {formData.nomStep || 'Station'} ({formData.dateAutosurveillance})
                </div>
              </div>

              {/* Retour d'envoi */}
              {emailStatus && (
                <div className={`p-3 rounded-xl text-xs flex items-start gap-2 ${
                  emailStatus.success ? 'bg-emerald-50 border border-emerald-300 text-emerald-800' : 'bg-rose-50 border border-rose-300 text-rose-800'
                }`}>
                  {emailStatus.success ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  )}
                  <div className="space-y-1">
                    <p className="font-semibold">{emailStatus.message}</p>
                    {emailStatus.previewUrl && (
                      <a
                        href={emailStatus.previewUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] underline text-sky-700 hover:text-sky-900 block font-medium"
                      >
                        Consulter l'aperçu du message envoyé (Ethereal Email) →
                      </a>
                    )}
                  </div>
                </div>
              )}

              {/* Boutons d'action */}
              <div className="space-y-2 pt-1">
                <button
                  type="button"
                  disabled={emailSending}
                  onClick={() => handleSendEmailDirect(formData.destinataireEmail || '')}
                  className="w-full py-3 px-4 bg-sky-600 hover:bg-sky-500 active:bg-sky-700 disabled:opacity-60 text-white font-bold rounded-xl flex items-center justify-center gap-2 text-xs sm:text-sm transition cursor-pointer shadow-md"
                >
                  {emailSending ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Envoi en cours avec pièce jointe PDF...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      <span>Envoyer l'e-mail avec le PDF joint</span>
                    </>
                  )}
                </button>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleShareEmailNative}
                    className="flex-1 py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
                    title="Partage direct via l'application de messagerie de votre smartphone"
                  >
                    <Smartphone className="w-3.5 h-3.5" />
                    <span>App messagerie mobile</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => downloadPdfBlob(generatedPdf.blob, generatedPdf.fileName)}
                    className="flex-1 py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Télécharger PDF</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="p-3 bg-slate-50 border-t border-slate-200 text-right">
              <button
                type="button"
                onClick={() => setShowEmailModal(false)}
                className="text-xs text-slate-600 hover:text-slate-900 font-semibold px-3 py-1 cursor-pointer"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL ZOOM PHOTO */}
      {showPhotoModal && (
        <div
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setShowPhotoModal(null)}
        >
          <div className="max-w-2xl w-full bg-slate-900 rounded-2xl overflow-hidden shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-3.5 border-b border-slate-800 text-white">
              <h4 className="text-sm font-bold">{showPhotoModal.title}</h4>
              <button
                type="button"
                onClick={() => setShowPhotoModal(null)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-2 bg-black flex items-center justify-center">
              <img src={showPhotoModal.src} alt={showPhotoModal.title} className="max-h-[70vh] object-contain rounded" />
            </div>
          </div>
        </div>
      )}

      {/* MODAL EXPORT HTML AUTONOME */}
      {showHtmlExportModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <FileCode className="w-6 h-6 text-sky-600" />
                <h3 className="text-base font-bold text-slate-900">
                  Livrable : Fichier HTML Autonome
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowHtmlExportModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              L'application est également disponible sous forme d'un <strong>fichier HTML unique et 100% autonome</strong> (<code className="bg-slate-100 px-1 py-0.5 rounded text-sky-700">autosurveillance-step.html</code>), incluant le formulaire terrain, Tailwind CSS et jsPDF via CDN avec génération du rapport PDF officiel, téléchargement direct et options de partage direct par WhatsApp ou e-mail.
            </p>

            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs text-slate-700 space-y-1">
              <p className="font-semibold text-slate-900">Emplacement dans le projet :</p>
              <p className="font-mono text-sky-700">/autosurveillance-step.html</p>
            </div>

            <div className="flex gap-2">
              <a
                href="/autosurveillance-step.html"
                download="autosurveillance-step-laurent-juillien.html"
                className="flex-1 py-2.5 px-4 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 text-xs transition"
              >
                <Download className="w-4 h-4" />
                <span>Télécharger le fichier .HTML</span>
              </a>

              <a
                href="/autosurveillance-step.html"
                target="_blank"
                rel="noreferrer"
                className="py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold rounded-xl flex items-center justify-center gap-1.5 text-xs transition"
              >
                <Eye className="w-4 h-4" />
                <span>Ouvrir en plein écran</span>
              </a>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
