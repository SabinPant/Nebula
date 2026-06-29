/**
 * Broker Application Page
 *
 * Public form for applying to become a broker on Nebula.
 * Collects personal details, document ID, and a photo of the document.
 * Uploads the document to the server (which forwards to Cloudinary).
 *
 * If the applicant's email already has a trader account, the server
 * flags it for Admin review — the applicant still gets a 200 response.
 *
 * UI: 3-step wizard with progress indicator, file preview, and
 * detailed upload status during submission.
 */

import { useState, useEffect, useRef, FormEvent } from "react";
import { Link } from "react-router-dom";
import { AuthLayout } from "../../components/layout/AuthLayout";
import { Input } from "../../components/ui/Input";
import { Button } from "../../components/ui/Button";
import { Alert } from "../../components/ui/Alert";
import api from "../../services/api";

// ─── Step definitions ─────────────────────────────────────────────────────────

const STEPS = [
  { number: 1, label: "Personal Info" },
  { number: 2, label: "Document" },
  { number: 3, label: "Application" },
] as const;

// ─── Sub-components ───────────────────────────────────────────────────────────

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="mb-8" aria-label="Application progress">
      <div className="flex items-center justify-between relative">
        {/* Connecting line behind the dots */}
        <div className="absolute top-4 left-0 right-0 h-px bg-gray-200 z-0" />
        <div
          className="absolute top-4 left-0 h-px bg-primary-500 z-0 transition-all duration-500 ease-in-out"
          style={{ width: `${((current - 1) / (STEPS.length - 1)) * 100}%` }}
        />

        {STEPS.map((step) => {
          const isDone = step.number < current;
          const isActive = step.number === current;

          return (
            <div
              key={step.number}
              className="flex flex-col items-center z-10"
              aria-current={isActive ? "step" : undefined}
            >
              <div
                className={`
                  w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold
                  border-2 transition-all duration-300
                  ${
                    isDone
                      ? "bg-primary-500 border-primary-500 text-white"
                      : isActive
                        ? "bg-white border-primary-500 text-primary-600"
                        : "bg-white border-gray-300 text-gray-400"
                  }
                `}
              >
                {isDone ? (
                  <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none">
                    <path
                      d="M3 8l3.5 3.5L13 4.5"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ) : (
                  step.number
                )}
              </div>
              <span
                className={`mt-2 text-xs font-medium transition-colors duration-300 ${
                  isActive
                    ? "text-primary-600"
                    : isDone
                      ? "text-gray-500"
                      : "text-gray-400"
                }`}
              >
                {step.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FieldGroup({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-lg border border-gray-100 bg-gray-50 px-4 py-4 space-y-4 ${className}`}
    >
      {children}
    </div>
  );
}

function HelperText({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-1 text-xs text-gray-400 leading-relaxed">{children}</p>
  );
}

function UploadProgress({ fileSize }: { fileName: string; fileSize: number }) {
  const [dots, setDots] = useState(".");

  useEffect(() => {
    const id = setInterval(
      () => setDots((d) => (d.length >= 3 ? "." : d + ".")),
      500,
    );
    return () => clearInterval(id);
  }, []);

  const sizeMB = (fileSize / (1024 * 1024)).toFixed(1);

  return (
    <div className="rounded-lg border border-primary-100 bg-primary-50 px-4 py-4 space-y-3">
      <div className="flex items-center gap-3">
        {/* Spinner */}
        <svg
          className="w-5 h-5 text-primary-500 animate-spin flex-shrink-0"
          viewBox="0 0 24 24"
          fill="none"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
          />
        </svg>
        <div className="min-w-0">
          <p className="text-sm font-medium text-primary-700">
            Uploading your document{dots}
            <span className="font-normal text-primary-500 ml-1">
              ({sizeMB} MB)
            </span>
          </p>
          <p className="text-xs text-primary-500 mt-0.5">
            This may take up to a minute for larger files. Please don't close
            this page.
          </p>
        </div>
      </div>

      {/* Pulsing progress bar */}
      <div className="h-1.5 w-full rounded-full bg-primary-200 overflow-hidden">
        <div className="h-full rounded-full bg-primary-500 animate-pulse w-2/3" />
      </div>
    </div>
  );
}

function CharCount({ value, min }: { value: string; min: number }) {
  const len = value.trim().length;
  const met = len >= min;
  return (
    <p
      className={`mt-1 text-xs font-medium ${met ? "text-green-600" : "text-gray-400"}`}
    >
      {met ? (
        <span className="flex items-center gap-1">
          <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none">
            <path
              d="M2 6l2.5 2.5L10 3.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Minimum length met ({len} characters)
        </span>
      ) : (
        `${len} / ${min} minimum`
      )}
    </p>
  );
}

function getAgeFromDateString(dateString: string): number | null {
  const parts = dateString.split("-").map((part) => Number(part));

  if (parts.length !== 3 || parts.some((part) => Number.isNaN(part))) {
    return null;
  }

  const [year, month, day] = parts;
  const today = new Date();
  let age = today.getFullYear() - year;

  const hasHadBirthdayThisYear =
    today.getMonth() > month - 1 ||
    (today.getMonth() === month - 1 && today.getDate() >= day);

  if (!hasHadBirthdayThisYear) {
    age -= 1;
  }

  return age;
}

function parseDateOnly(dateString: string): Date | null {
  const parts = dateString.split("-").map((part) => Number(part));

  if (parts.length !== 3 || parts.some((part) => Number.isNaN(part))) {
    return null;
  }

  const [year, month, day] = parts;
  const parsed = new Date(year, month - 1, day);

  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return null;
  }

  return parsed;
}

// ─── Main component ───────────────────────────────────────────────────────────

export function BrokerApply() {
  // Form values
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [documentIdNumber, setDocumentIdNumber] = useState("");
  const [reason, setReason] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);

  // UI state
  const [step, setStep] = useState(1);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [warning, setWarning] = useState("");
  const [referenceId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Clean up blob URL on unmount / file change
  useEffect(() => {
    return () => {
      if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl);
    };
  }, [filePreviewUrl]);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0] || null;
    setFile(selected);

    if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl);
    if (selected) {
      setFilePreviewUrl(URL.createObjectURL(selected));
    } else {
      setFilePreviewUrl(null);
    }

    // Clear file error on new selection
    if (selected) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next.file;
        return next;
      });
    }
  }

  // ── Per-step validation ────────────────────────────────────────────────────

  function validateStep1(): boolean {
    const errors: Record<string, string> = {};

    if (!fullName.trim()) errors.fullName = "Full name is required.";
    if (!email.trim()) errors.email = "Email is required.";
    if (!phone.trim()) {
      errors.phone = "Phone number is required.";
    } else if (!/^\+?[0-9]{10,15}$/.test(phone.replace(/\s/g, ""))) {
      errors.phone = "Enter a valid phone number (10-15 digits).";
    }

    if (!dateOfBirth) {
      errors.dateOfBirth = "Date of birth is required.";
    } else {
      const dob = parseDateOnly(dateOfBirth);

      if (!dob) {
        errors.dateOfBirth = "Please enter a valid date of birth.";
      } else {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (dob > today) {
          errors.dateOfBirth = "Date of birth cannot be in the future.";
        } else {
          const age = getAgeFromDateString(dateOfBirth);

          if (age === null) {
            errors.dateOfBirth = "Please enter a valid date of birth.";
          } else if (age < 21 || age > 89) {
            errors.dateOfBirth =
              "Applicants must be between 21 and 89 years old.";
          }
        }
      }
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  function validateStep2(): boolean {
    const errors: Record<string, string> = {};

    if (!documentIdNumber.trim())
      errors.documentIdNumber = "Document ID number is required.";
    if (!file) {
      errors.file = "Please upload a photo of your document.";
    } else if (file.size > 5 * 1024 * 1024) {
      errors.file = "File size must be less than 5 MB.";
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  function validateStep3(): boolean {
    const errors: Record<string, string> = {};

    if (!reason.trim() || reason.trim().length < 20)
      errors.reason = "Please provide a reason (at least 20 characters).";

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  // ── Navigation ─────────────────────────────────────────────────────────────

  function goNext() {
    setError("");
    const valid =
      step === 1 ? validateStep1() : step === 2 ? validateStep2() : true;
    if (valid) setStep((s) => s + 1);
  }

  function goBack() {
    setError("");
    setFieldErrors({});
    setStep((s) => s - 1);
  }

  // ── Submit ─────────────────────────────────────────────────────────────────

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setWarning("");

    if (!validateStep3()) return;

    setLoading(true);

    try {
      const formData = new FormData();
      formData.append("fullName", fullName);
      formData.append("email", email);
      formData.append("phone", phone);
      formData.append("dateOfBirth", dateOfBirth);
      formData.append("documentIdNumber", documentIdNumber);
      formData.append("reason", reason);
      if (file) formData.append("document", file);

      const { data } = await api.post("/broker-applications", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      if (data.warning) setWarning(data.warning.message);

      setSuccess(true);
    } catch (err: any) {
      const code = err.response?.data?.code;
      const message = err.response?.data?.message;

      if (Array.isArray(message) && message.length > 0) {
        setError(message[0]);
      } else {
        switch (code) {
          case "INVALID_FILE_TYPE":
            setError("Only JPEG, PNG, and WebP images are allowed.");
            break;
          case "FILE_TOO_LARGE":
            setError("File size must be less than 5 MB.");
            break;
          case "DUPLICATE_APPLICATION":
            setError(
              "You have already submitted an application. Please wait for review.",
            );
            break;
          case "VALIDATION_ERROR":
            setError(message || "Please check your information and try again.");
            break;
          case "DUPLICATE_PHONE":
            setError(
              "This phone number has already been used for an application.",
            );
            break;
          default:
            setError(message || "Something went wrong. Please try again.");
        }
      }
    } finally {
      setLoading(false);
    }
  }

  // ── Success screen ─────────────────────────────────────────────────────────

  if (success) {
    return (
      <AuthLayout
        title="Application Received"
        subtitle="We'll be in touch soon"
      >
        <div className="flex flex-col items-center text-center mb-6">
          {/* Animated check circle */}
          <div className="w-16 h-16 rounded-full bg-green-50 border-2 border-green-200 flex items-center justify-center mb-4">
            <svg
              className="w-8 h-8 text-green-500"
              viewBox="0 0 24 24"
              fill="none"
              aria-label="Success"
            >
              <path
                d="M5 13l4 4L19 7"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <h3 className="text-base font-semibold text-gray-900">
            Your application has been submitted
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            A confirmation has been sent to{" "}
            <strong className="text-gray-700">{email}</strong>
          </p>
        </div>

        {referenceId && (
          <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 mb-4 text-center">
            <p className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-1">
              Reference ID
            </p>
            <p className="font-mono text-sm font-semibold text-gray-800">
              {referenceId}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              Keep this for your records
            </p>
          </div>
        )}

        <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 mb-4 space-y-2">
          <p className="text-sm font-medium text-blue-800">What happens next</p>
          <ol className="text-xs text-blue-700 space-y-1 list-none">
            {[
              "Our team will review your application within 3–5 business days",
              "We may contact you if additional information is needed",
              "You'll receive an email with our decision",
            ].map((item, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="flex-shrink-0 w-4 h-4 rounded-full bg-blue-200 text-blue-700 flex items-center justify-center text-xs font-semibold mt-0.5">
                  {i + 1}
                </span>
                {item}
              </li>
            ))}
          </ol>
        </div>

        {warning && (
          <div className="mb-4">
            <Alert variant="warning">{warning}</Alert>
          </div>
        )}

        <div className="text-center">
          <Link
            to="/"
            className="text-sm text-primary-600 hover:text-primary-700 font-medium"
          >
            ← Back to home
          </Link>
        </div>
      </AuthLayout>
    );
  }

  // ── Form ───────────────────────────────────────────────────────────────────

  return (
    <AuthLayout
      title="Become a Broker"
      subtitle="Apply to mentor traders on Nebula"
    >
      <StepIndicator current={step} />

      <form onSubmit={handleSubmit} noValidate>
        {error && (
          <div className="mb-4">
            <Alert variant="error">{error}</Alert>
          </div>
        )}

        {/* ── Step 1: Personal Information ─────────────────────────────────── */}
        {step === 1 && (
          <div className="space-y-4">
            <FieldGroup>
              <Input
                label="Full legal name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="As it appears on your ID document"
                error={fieldErrors.fullName}
                autoFocus
                required
                aria-required="true"
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Email address"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  error={fieldErrors.email}
                  required
                  aria-required="true"
                />
                <div>
                  <Input
                    label="Phone number"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+977 98XXXXXXXX"
                    error={fieldErrors.phone}
                    required
                    aria-required="true"
                  />
                  {!fieldErrors.phone && (
                    <HelperText>
                      Include country code (e.g. +977 for Nepal)
                    </HelperText>
                  )}
                </div>
              </div>

              <div>
                <Input
                  label="Date of birth"
                  type="date"
                  value={dateOfBirth}
                  onChange={(e) => setDateOfBirth(e.target.value)}
                  error={fieldErrors.dateOfBirth}
                  required
                  aria-required="true"
                />
                {!fieldErrors.dateOfBirth && (
                  <HelperText>
                    You must be at least 21 years old to apply as a broker.
                  </HelperText>
                )}
              </div>
            </FieldGroup>

            <Button type="button" className="w-full" onClick={goNext}>
              Continue to Document →
            </Button>
          </div>
        )}

        {/* ── Step 2: Document Details ──────────────────────────────────────── */}
        {step === 2 && (
          <div className="space-y-4">
            <FieldGroup>
              <div>
                <Input
                  label="Document ID number"
                  value={documentIdNumber}
                  onChange={(e) => setDocumentIdNumber(e.target.value)}
                  placeholder="e.g. 12345-678901"
                  error={fieldErrors.documentIdNumber}
                  required
                  aria-required="true"
                />
                {!fieldErrors.documentIdNumber && (
                  <HelperText>
                    Enter your citizenship number, passport number, or driver's
                    licence number exactly as it appears on the document.
                  </HelperText>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Document photo <span className="text-red-500">*</span>
                </label>
                <div className="flex gap-4 items-start">
                  {/* Thumbnail preview */}
                  <div
                    className={`
                      flex-shrink-0 w-[150px] h-[150px] rounded-lg border-2 border-dashed
                      flex items-center justify-center overflow-hidden bg-gray-50
                      ${filePreviewUrl ? "border-primary-300" : "border-gray-300"}
                    `}
                  >
                    {filePreviewUrl ? (
                      <img
                        src={filePreviewUrl}
                        alt="Document preview"
                        className="w-full h-full object-cover rounded-md"
                      />
                    ) : (
                      <div className="text-center px-2">
                        <svg
                          className="w-8 h-8 text-gray-300 mx-auto mb-1"
                          viewBox="0 0 24 24"
                          fill="none"
                        >
                          <path
                            d="M4 16l4-4 4 4 4-6 4 6"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                          <rect
                            x="3"
                            y="3"
                            width="18"
                            height="18"
                            rx="2"
                            stroke="currentColor"
                            strokeWidth="1.5"
                          />
                        </svg>
                        <p className="text-xs text-gray-400">Preview</p>
                      </div>
                    )}
                  </div>

                  {/* File input area */}
                  <div className="flex-1 min-w-0">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={handleFileChange}
                      disabled={loading}
                      aria-label="Upload document photo"
                      className="w-full text-sm text-gray-500
                        file:mr-3 file:py-2 file:px-3 file:rounded-md file:border-0
                        file:text-sm file:font-medium file:bg-primary-50
                        file:text-primary-700 hover:file:bg-primary-100
                        file:cursor-pointer cursor-pointer"
                    />
                    {file ? (
                      <p className="mt-2 text-xs text-gray-500">
                        <span className="font-medium text-gray-700">
                          {file.name}
                        </span>
                        {" · "}
                        {(file.size / 1024).toFixed(0)} KB
                        {" · "}
                        <button
                          type="button"
                          onClick={() => {
                            setFile(null);
                            setFilePreviewUrl(null);
                            if (fileInputRef.current)
                              fileInputRef.current.value = "";
                          }}
                          className="text-red-500 hover:text-red-600 underline"
                        >
                          Remove
                        </button>
                      </p>
                    ) : (
                      <HelperText>
                        JPEG, PNG, or WebP · Max 5 MB. Take a clear, well-lit
                        photo of your entire document.
                      </HelperText>
                    )}
                    {fieldErrors.file && (
                      <p className="mt-1 text-sm text-red-500">
                        {fieldErrors.file}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </FieldGroup>

            <div className="flex gap-3">
              <Button
                type="button"
                variant="secondary"
                className="flex-1"
                onClick={goBack}
              >
                ← Back
              </Button>
              <Button type="button" className="flex-1" onClick={goNext}>
                Continue →
              </Button>
            </div>
          </div>
        )}

        {/* ── Step 3: Reason & Submit ───────────────────────────────────────── */}
        {step === 3 && (
          <div className="space-y-4">
            <FieldGroup>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Why do you want to become a broker?{" "}
                  <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={5}
                  disabled={loading}
                  placeholder="Tell us about your financial background, experience mentoring others, and why you'd be a great broker for Nebula traders."
                  aria-required="true"
                  aria-describedby="reason-count reason-error"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 resize-none disabled:opacity-60"
                />
                <div id="reason-count">
                  <CharCount value={reason} min={20} />
                </div>
                {fieldErrors.reason && (
                  <p id="reason-error" className="mt-1 text-sm text-red-500">
                    {fieldErrors.reason}
                  </p>
                )}
              </div>
            </FieldGroup>

            {/* Upload progress feedback */}
            {loading && file && (
              <UploadProgress fileName={file.name} fileSize={file.size} />
            )}

            <div className="flex gap-3">
              <Button
                type="button"
                variant="secondary"
                className="flex-1"
                onClick={goBack}
                disabled={loading}
              >
                ← Back
              </Button>
              <Button type="submit" className="flex-1" disabled={loading}>
                {loading ? "Submitting application..." : "Submit application"}
              </Button>
            </div>

            {/* Review notice */}
            {!loading && (
              <p className="text-center text-xs text-gray-400 leading-relaxed">
                By submitting, you confirm that all information provided is
                accurate. Applications are reviewed within 3–5 business days.
              </p>
            )}
          </div>
        )}
      </form>

      <p className="mt-6 text-center text-sm text-gray-500">
        Already have an account?{" "}
        <Link
          to="/login"
          className="text-primary-600 hover:text-primary-700 font-medium"
        >
          Log in
        </Link>
      </p>
    </AuthLayout>
  );
}
