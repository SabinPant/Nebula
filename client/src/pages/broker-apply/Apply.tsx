/**
 * Broker Application Page
 *
 * Public form for applying to become a broker on Nebula.
 * Collects personal details, document ID, and a photo of the document.
 * Uploads the document to the server (which forwards to Cloudinary).
 *
 * If the applicant's email already has a trader account, the server
 * flags it for Admin review — the applicant still gets a 200 response.
 */

import { useState, FormEvent } from "react";
import { Link } from "react-router-dom";
import { AuthLayout } from "../../components/layout/AuthLayout";
import { Input } from "../../components/ui/Input";
import { Button } from "../../components/ui/Button";
import { Alert } from "../../components/ui/Alert";
import api from "../../services/api";

export function BrokerApply() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [documentIdNumber, setDocumentIdNumber] = useState("");
  const [reason, setReason] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [warning, setWarning] = useState("");

  function validateForm(): boolean {
    const errors: Record<string, string> = {};

    if (!fullName.trim()) errors.fullName = "Full name is required.";
    if (!email.trim()) errors.email = "Email is required.";
    if (!phone.trim()) errors.phone = "Phone number is required.";

    if (dateOfBirth) {
      const dob = new Date(dateOfBirth);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (isNaN(dob.getTime())) {
        errors.dateOfBirth = "Please enter a valid date of birth.";
      } else if (dob > today) {
        errors.dateOfBirth = "Date of birth cannot be in the future.";
      } else {
        const minAgeDate = new Date();
        minAgeDate.setFullYear(today.getFullYear() - 21);
        if (dob > minAgeDate) {
          errors.dateOfBirth = "You must be at least 21 years old to apply.";
        }
      }
    }
    if (!documentIdNumber.trim())
      errors.documentIdNumber = "Document ID number is required.";
    if (!reason.trim() || reason.trim().length < 20)
      errors.reason = "Please provide a reason (at least 20 characters).";
    if (!file) errors.file = "Please upload a photo of your document.";
    if (file && file.size > 5 * 1024 * 1024)
      errors.file = "File size must be less than 5MB.";

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setWarning("");

    if (!validateForm()) return;

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

      if (data.warning) {
        setWarning(data.warning.message);
      }

      setSuccess(true);
    } catch (err: any) {
      const code = err.response?.data?.code;
      const message = err.response?.data?.message;

      // Handle validation errors (array of strings from server)
      if (Array.isArray(message) && message.length > 0) {
        setError(message[0]);
      } else {
        switch (code) {
          case "INVALID_FILE_TYPE":
            setError("Only JPEG, PNG, and WebP images are allowed.");
            break;
          case "FILE_TOO_LARGE":
            setError("File size must be less than 5MB.");
            break;
          case "DUPLICATE_APPLICATION":
            setError(
              "You have already submitted an application. Please wait for review.",
            );
            break;
          case "VALIDATION_ERROR":
            setError(message || "Please check your information and try again.");
            break;
          default:
            setError(message || "Something went wrong. Please try again.");
        }
      }
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <AuthLayout
        title="Application Submitted"
        subtitle="Thank you for applying"
      >
        <Alert variant="success">
          Your application has been received. Our team will review it and you
          will receive an email at <strong>{email}</strong> with the next steps.
        </Alert>
        {warning && (
          <div className="mt-4">
            <Alert variant="warning">{warning}</Alert>
          </div>
        )}
        <div className="mt-6 text-center">
          <Link
            to="/"
            className="text-sm text-primary-600 hover:text-primary-700 font-medium"
          >
            Back to home
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Become a Broker"
      subtitle="Apply to mentor traders on Nebula"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <Alert variant="error">{error}</Alert>}

        <Input
          label="Full legal name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="As per your identification document"
          error={fieldErrors.fullName}
          required
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
          />
          <Input
            label="Phone number"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+977 98XXXXXXXX"
            error={fieldErrors.phone}
            required
          />
        </div>

        <Input
          label="Date of birth"
          type="date"
          value={dateOfBirth}
          onChange={(e) => setDateOfBirth(e.target.value)}
          error={fieldErrors.dateOfBirth}
          required
        />

        <Input
          label="Document ID number"
          value={documentIdNumber}
          onChange={(e) => setDocumentIdNumber(e.target.value)}
          placeholder="Citizenship, passport, or driver's licence number"
          error={fieldErrors.documentIdNumber}
          required
        />

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Document photo
          </label>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100"
          />
          {fieldErrors.file && (
            <p className="mt-1 text-sm text-danger-500">{fieldErrors.file}</p>
          )}
          {file && (
            <p className="mt-1 text-xs text-gray-400">
              {file.name} ({(file.size / 1024).toFixed(1)} KB)
            </p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Why do you want to become a broker?
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={4}
            placeholder="Tell us about your background and why you'd make a great broker (min. 20 characters)"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          />
          {fieldErrors.reason && (
            <p className="mt-1 text-sm text-danger-500">{fieldErrors.reason}</p>
          )}
        </div>

        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Submitting..." : "Submit application"}
        </Button>
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
