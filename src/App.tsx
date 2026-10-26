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
      errs.entreePhoto = formData.presencePreleveur ? "La photo du préleveur Entrée est obligatoire."
