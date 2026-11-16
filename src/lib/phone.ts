/** 숫자만 남긴 휴대폰 번호 → "010-****-1234" (화면·로그 공통 마스킹) */
export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return "-";
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 8) return "****";
  return `${digits.slice(0, 3)}-****-${digits.slice(-4)}`;
}

export function normalizePhone(input: string): string | null {
  const digits = input.replace(/\D/g, "");
  return /^01[016789]\d{7,8}$/.test(digits) ? digits : null;
}
