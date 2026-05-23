export const PASSWORD_REQUIREMENTS_MESSAGE =
  "Password must be at least 8 characters and include one capital letter and one number.";

export const passwordMeetsRequirements = (value = "") => (
  value.length >= 8 && /[A-Z]/.test(value) && /[0-9]/.test(value)
);
