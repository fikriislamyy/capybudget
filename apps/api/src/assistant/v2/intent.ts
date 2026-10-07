/** Recognize clear entry statements locally so slang cannot become a history query. */
export function isTransactionEntry(text:string):boolean {
  const value=text.normalize('NFKC').toLowerCase();
  const amount=/\b\d[\d.,]*\s*(?:k|rb|ribu|jt|juta|idr|usd)\b|\brp\.?\s*\d|\$\s*\d/.test(value);
  if(!amount)return false;
  if(/\b(?:delete|hapus|remove|ubah|edit|transfer|kirim)\b/.test(value))return false;
  const explicit=/\b(?:add|log|record|catat|catetin|catatin|tambah|tambahkan|masukkan|simpan)\b/.test(value);
  if(explicit)return true;
  if(/\b(?:berapa|apakah|kapan|mana|how|what|when|where|did i|have i)\b|\?/.test(value))return false;
  return /\b(?:gue|gw|gua|aku|saya)\s+(?:(?:baru|barusan|udah|sudah|habis|abis)\s+){0,3}(?:transaksi|beli|membeli|bayar|membayar|belanja|jajan|makan|dapat|dapet|terima|menerima)\b|\bi\s+(?:just\s+)?(?:spent|bought|paid|received)\b/.test(value);
}
