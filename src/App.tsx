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

  // Ouverture du dialogue d'envoi par e-mail
  const handleOpenEmailModal = () => {
    if (!generatedPdf) return;
    setEmailStatus(null);
    setShowEmailModal(true);
  };

  // Envoi réel par e-mail via le client natif / téléchargement (adapté à GitHub Pages)
  const handleSendEmailDirect = async (recipient: string) => {
    if (!generatedPdf) return;
    try {
      setEmailSending(true);
      downloadPdfBlob(generatedPdf.blob, generatedPdf.fileName);
      const shared = await shareReportNatively(formData, generatedPdf.blob, generatedPdf.fileName);
      if (!shared) {
        sendReportByEmail(formData, generatedPdf.fileName);
      }
      setShareFeedback("Application de messagerie ouverte et PDF téléchargé !");
      setTimeout(() => setShareFeedback(null), 5000);
      setShowEmailModal(false);
    } catch (err: any) {
      setEmailStatus({
        success: false,
        message: err?.message || "Erreur lors de l'ouverture de la messagerie.",
      });
    } finally {
      setEmailSending(false);
    }
  };

  const handleSendEmail = () => {
    handleOpenEmailModal();
  };

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
        errs.entreeDebit = "Estimation du débit requise.";
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
        errs.sortieDebit = "Estimation du débit requise.";
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

      const res = await generateAutosurveillancePdf(formData);
      setGeneratedPdf(res);
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

  const handleLoadSample = () => {
    const generateSampleCanvas = (title: string, color: string): string => {
      const c = document.createElement('canvas');
      c.width = 640;
      c.height = 480;
      const ctx = c.getContext('2d');
      if (!ctx) return '';

      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, 640, 480);

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

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 20px sans-serif';
      ctx.fillText(title, 140, 310);

      return c.toDataURL('image/jpeg', 0.85);
    };

    setFormData({
      nomStep: "STEP Goderville",
      dateAutosurveillance: today,
      technicienNom: "Laurent JUILLIEN",
      meteo: "Soleil",
      observations: "Essai",
      entreeHasDebimetre: false,
      entreeDebit: "45.0",
      entreeTempsMarchePompes: "1.5",
      entreeDebitPompeNominal: "30",
      entreeDebitEstime: "45.0",
      sortieHasDebimetre: false,
      sortieDebit: "60.0",
      sortieTempsMarchePompes: "2",
      sortieDebitPompeNominal: "30",
      sortieDebitEstime: "60.0",
      presencePreleveur: true,
      preleveurType: "péristaltique",
      preleveurAsservissement: "débit",
      preleveurFrequenceDebit: "10",
      preleveurFrequenceTemps: "15",
      entreeDate: today,
      entreeHeure: defaultHour,
      entreeTemperature: "2.1",
      entreePhoto: generateSampleCanvas("PHOTO : PRELEVEUR ENTREE", "#0369a1"),
      entreePhotoNom: "preleveur_entree.jpg",
      sortieDate: today,
      sortieHeure: defaultHour,
      sortieTemperature: "2.5",
      sortiePhoto: generateSampleCanvas("PHOTO : PRELEVEUR SORTIE", "#047857"),
      sortiePhotoNom: "preleveur_sortie.jpg",
      destinataireEmail: 'laurentjuillien@free.fr',
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

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800 flex flex-col font-sans selection:bg-sky-500 selection:text-white pb-12">
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
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleLoadSample}
              className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-2 rounded-xl font-medium transition border border-slate-700 flex items-center gap-1.5 cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>Exemple</span>
            </button>
            <button
              type="button"
              onClick={() => setShowHtmlExportModal(true)}
              className="text-xs bg-sky-950 hover:bg-sky-900 text-sky-200 px-3 py-2 rounded-xl font-medium transition border border-sky-800 flex items-center gap-1.5 cursor-pointer"
            >
              <FileCode className="w-3.5 h-3.5 text-sky-300" />
              <span>HTML</span>
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="text-xs text-rose-300 hover:text-rose-200 bg-rose-950/40 p-2 rounded-xl border border-rose-800 transition cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto w-full px-3.5 sm:px-6 py-6 flex-1 space-y-6">
        {generatedPdf && (
          <div className="bg-emerald-50 border border-emerald-300 rounded-2xl p-4 sm:p-5 text-emerald-950 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-emerald-500 text-white flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-sm sm:text-base font-extrabold text-emerald-900">
                  ✓ Rapport PDF généré et téléchargé !
                </h3>
                <p className="text-xs text-emerald-800 mt-1">
                  Station : <strong>{formData.nomStep}</strong>
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto shrink-0">
              <button
                type="button"
                onClick={handleShareWhatsApp}
                className="flex-1 sm:flex-none px-3.5 py-2.5 bg-[#25D366] text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <MessageCircle className="w-4 h-4 fill-white" />
                <span>WhatsApp</span>
              </button>
              <button
                type="button"
                onClick={handleSendEmail}
                className="flex-1 sm:flex-none px-3.5 py-2.5 bg-sky-600 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Mail className="w-4 h-4" />
                <span>E-mail</span>
              </button>
              <button
                type="button"
                onClick={() => setShowPdfModal(true)}
                className="px-3.5 py-2.5 bg-slate-800 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <FileText className="w-4 h-4" />
                <span>Aperçu PDF</span>
              </button>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6" noValidate>
          <section className="bg-white rounded-2xl p-4 sm:p-6 shadow-sm border border-slate-200">
            <div className="flex items-center gap-2.5 pb-3 mb-4 border-b border-slate-100">
              <div className="w-7 h-7 rounded-lg bg-sky-100 text-sky-700 flex items-center justify-center font-bold text-sm">
                1
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-bold text-slate-900">
                  En-tête &amp; Informations Générales
                </h2>
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
                  placeholder="ex: STEP Goderville"
                  className={`w-full px-3.5 py-2.5 text-sm sm:text-base rounded-xl border ${
                    errors.nomStep ? 'border-rose-500 bg-rose-50/40 text-rose-900' : 'border-slate-300 bg-slate-50/50'
                  } focus:outline-none focus:ring-2 focus:ring-sky-500`}
                />
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
                    className="w-full pl-3.5 pr-10 py-2.5 text-sm sm:text-base rounded-xl border border-slate-300 bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                  <Calendar className="w-4 h-4 text-slate-400 absolute right-3.5 top-3 pointer-events-none" />
                </div>
              </div>

              <div>
                <label htmlFor="technicienNom" className="block text-xs font-semibold text-slate-600 mb-1">
                  Technicien de traitement
                </label>
                <input
                  type="text"
                  id="technicienNom"
                  value={formData.technicienNom}
                  onChange={(e) => handleChange('technicienNom', e.target.value)}
                  placeholder="ex: Laurent JUILLIEN"
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-300 bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div>
                <label htmlFor="meteo" className="block text-xs font-semibold text-slate-600 mb-1">
                  Conditions météo sur 24h
                </label>
                <select
                  id="meteo"
                  value={formData.meteo || 'Soleil'}
                  onChange={(e) => handleChange('meteo', e.target.value)}
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-300 bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-sky-500 text-slate-800 font-medium"
                >
                  <option value="Soleil">Soleil</option>
                  <option value="Pluie">Pluie</option>
                  <option value="Neige">Neige</option>
                  <option value="Orage">Orage</option>
                </select>
              </div>
            </div>
          </section>

          <div className="pt-2">
            <button
              type="submit"
              disabled={generationStep !== 'idle'}
              className="w-full py-4 bg-gradient-to-r from-sky-600 to-blue-700 hover:from-sky-500 hover:to-blue-600 text-white font-extrabold rounded-2xl shadow-lg shadow-sky-600/25 transition flex items-center justify-center gap-2 cursor-pointer text-base"
            >
              {generationStep !== 'idle' ? (
                <>
                  <RefreshCw className="w-5 h-5 animate-spin" />
                  <span>{statusMessage || "Traitement en cours..."}</span>
                </>
              ) : (
                <>
                  <Download className="w-5 h-5" />
                  <span>Générer et Télécharger le Rapport PDF Officiel</span>
                </>
              )}
            </button>
          </div>
        </form>
      </main>

      {showPdfModal && generatedPdf && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6">
          <div className="bg-white w-full max-w-4xl h-[92vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden">
            <div className="bg-slate-900 text-white px-5 py-4 flex items-center justify-between border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <FileText className="w-5 h-5 text-sky-400" />
                <h3 className="font-bold text-sm sm:text-base">Aperçu du Rapport PDF Officiel</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowPdfModal(false)}
                className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-300 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 bg-slate-100 p-2 sm:p-4">
              <iframe
                src={generatedPdf.blobUrl}
                className="w-full h-full rounded-2xl border border-slate-300 shadow-inner bg-white"
                title="Aperçu PDF"
              />
            </div>
            <div className="bg-white px-5 py-3.5 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleShareWhatsApp}
                  className="px-4 py-2.5 bg-[#25D366] hover:bg-[#20ba59] text-white font-bold rounded-xl text-xs flex items-center gap-1.5 cursor-pointer shadow-sm"
                >
                  <MessageCircle className="w-4 h-4 fill-white" />
                  <span>Partager WhatsApp</span>
                </button>
                <button
                  type="button"
                  onClick={handleSendEmail}
                  className="px-4 py-2.5 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 cursor-pointer shadow-sm"
                >
                  <Mail className="w-4 h-4" />
                  <span>Envoyer par e-mail</span>
                </button>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => downloadPdfBlob(generatedPdf.blob, generatedPdf.fileName)}
                  className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 cursor-pointer shadow-sm"
                >
                  <Download className="w-4 h-4" />
                  <span>Télécharger</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowPdfModal(false)}
                  className="px-4 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-xl text-xs transition cursor-pointer"
                >
                  Fermer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showEmailModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-extrabold text-slate-900 text-base flex items-center gap-2">
                <Mail className="w-5 h-5 text-sky-600" />
                <span>Transmission par E-mail</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowEmailModal(false)}
                className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Le rapport PDF officiel (avec photographies horodatées) va être ouvert ou transmis via votre client de messagerie.
            </p>
            <div className="space-y-1">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                Adresse e-mail du destinataire
              </label>
              <input
                type="email"
                value={formData.destinataireEmail || ''}
                onChange={(e) => handleChange('destinataireEmail', e.target.value)}
                placeholder="ex: laurentjuillien@free.fr"
                className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>
            <button
              type="button"
              disabled={emailSending}
              onClick={() => handleSendEmailDirect(formData.destinataireEmail)}
              className="w-full py-3 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-sky-600/20"
            >
              {emailSending ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Ouverture de la messagerie...</span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  <span>Ouvrir l'application de messagerie</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
