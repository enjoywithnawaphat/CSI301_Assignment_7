# Violet Bank · Infura

เว็บบน GitHub Pages ใช้ **Web3.js → Infura → Ethereum Sepolia**. หน้าเว็บโหลด ABI จาก `Bank.abi.json` แล้วเรียกสัญญา Bank ที่ตั้งไว้ใน `config.js`.

## โครงสร้างตาม Blueprint

1. `new Web3(new Web3.providers.HttpProvider(url))` เชื่อม Web3.js กับ Infura.
2. `new web3.eth.Contract(abi, address)` สร้างตัวเรียกสัญญาที่ Deploy แล้ว.
3. `web3.eth.accounts.privateKeyToAccount(privateKey)` นำเข้าบัญชีทดสอบเดิม และ `web3.eth.accounts.wallet.add(account)` เพิ่มบัญชีเข้า Wallet ของ Web3.js ในแท็บ.
4. `checkBlance().call({ from })` อ่านยอดผ่าน Infura. เมื่อยืนยันฝากหรือถอน บัญชีลงนามในแท็บ แล้ว `sendSignedTransaction()` ส่งธุรกรรมผ่าน Infura.

## ตั้งค่าครั้งเดียวก่อนอัปโหลด

เปิด Ethereum Sepolia ใน Infura Dashboard แล้วคัดลอก **API key** มาใส่ใน `config.js`. ใช้เฉพาะคีย์ 32 ตัวจากโปรเจกต์ทดสอบ.

```js
infuraApiKey: "ใส่_API_KEY_จาก_Infura",
```

เบราว์เซอร์ใช้คีย์นี้โดยตรง ผู้ใช้จึงไม่ต้องกรอกเอง. คีย์ใน `config.js` มองเห็นได้จากหน้าเว็บ. เก็บ API Key Secret, private key และไฟล์กระเป๋าไว้นอก repository.

[คู่มือ Infura](https://docs.infura.io/get-started/infura/)

## เผยแพร่บน GitHub Pages

1. อัปโหลดไฟล์ในโฟลเดอร์นี้รวม `vendor/` ให้ `index.html` อยู่ที่รากของสาขา `main`.
2. เปิด **Settings → Pages → Deploy from a branch → main → /(root) → Save**.
3. เปิด **Visit site** ทดสอบการทำงาน แล้วนำ URL ไปส่ง.

[คู่มือ GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)

## ใช้งาน

1. เปิดเว็บในเบราว์เซอร์ที่ติดตั้ง MetaMask กด **เชื่อม MetaMask** แล้วอนุญาตบัญชีและเลือก Sepolia. ครั้งถัดไปเมื่อเปิดเว็บเดิมและ MetaMask ยังอนุญาตอยู่ เว็บจะโหลดบัญชีและยอดผ่าน Infura อัตโนมัติ. เมื่อเปลี่ยนบัญชีใน MetaMask เว็บจะอัปเดตยอดให้.
2. ทดสอบฝาก `0.001 ETH` และถอน `0.0004 ETH` โดยยืนยันแต่ละรายการใน MetaMask. หากเริ่มจากยอดฝากศูนย์ ยอดจะเหลือ `0.0006 ETH`. MetaMask ลงนามและส่งธุรกรรม ส่วนหน้าเว็บใช้ Infura อ่านผลและอัปเดตยอด.
3. สำหรับสาธิตการลงนามตาม Blueprint ให้กด **โหมดตาม PDF** แล้วสร้างกระเป๋าทดสอบ เปิดไฟล์กระเป๋า JSON เดิม หรือนำเข้าคีย์ของบัญชีทดสอบบนเว็บที่คุณรันเอง. โหมดนี้ลงนามในแท็บและส่งธุรกรรมที่ลงนามแล้วผ่าน Infura โดยตรง.

ยอดฝากเดิมผูกกับที่อยู่เดิม. [สัญญา Bank บน Sepolia Etherscan](https://sepolia.etherscan.io/address/0x014AAb5c416d4bB194aD99CCC16265dFDcAFA613)

ใช้บัญชีทดสอบที่แยกจากบัญชีเงินจริง. [คู่มือดู Private key ของบัญชีใน MetaMask](https://support.metamask.io/it/configure/accounts/how-to-export-an-accounts-private-key/)

### เปิดในเครื่อง

จากโฟลเดอร์ที่มี `index.html` รัน `python -m http.server 8080 --bind 127.0.0.1` แล้วเปิด [127.0.0.1:8080](http://127.0.0.1:8080).

ถ้าไม่พบ MetaMask ให้เปิด URL ใน Chrome ที่เปิดใช้งานส่วนขยายและปลดล็อกกระเป๋า. ถ้าเว็บแสดงที่อยู่บัญชีแต่แจ้งว่า Infura ยังไม่พร้อม ให้ตรวจ `infuraApiKey` ใน `config.js` แล้วรีเฟรชหน้าเว็บ.
