// ETH amounts are kept as exact integers in wei.
globalThis.BankProtocol = Object.freeze({
  chainId: "0xaa36a7",
  isAddress: (value) => /^0x[0-9a-f]{40}$/i.test(value) && !/^0x0{40}$/i.test(value),
  parseAmount(input) {
    const value = input.trim();
    if (!/^\d{1,78}(?:\.\d{1,18})?$/.test(value)) {
      throw new Error("กรอกจำนวน ETH เป็นตัวเลข ทศนิยมได้ไม่เกิน 18 ตำแหน่ง");
    }
    const [whole, decimal = ""] = value.split(".");
    const wei = BigInt(whole + decimal.padEnd(18, "0"));
    if (wei <= 0n || wei >= 2n ** 256n) throw new Error("จำนวน ETH อยู่นอกช่วงที่รองรับ");
    return wei;
  },
  formatAmount(wei) {
    const digits = wei.toString().padStart(19, "0");
    const decimal = digits.slice(-18).replace(/0+$/, "");
    return digits.slice(0, -18) + (decimal ? "." + decimal : "");
  },
});
