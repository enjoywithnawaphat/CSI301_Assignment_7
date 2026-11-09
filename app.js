(() => {
  const config = window.BANK_CONFIG;
  const bank = window.BankProtocol;
  const ui = Object.fromEntries([...document.querySelectorAll("[id]")].map(node => [node.id, node]));
  const explorer = "https://sepolia.etherscan.io";
  const address = config.contractAddress.trim();
  const connectedMessage = "เชื่อมต่อ Infura บน Sepolia แล้ว";
  let metaMask;
  let walletAddress;
  let session;
  let busy = false;
  let followMetaMask = true;
  let walletUpdatePending = false;

  ui["student-id"].textContent = config.studentId || "ยังไม่ได้ระบุ";
  ui["student-name"].textContent = config.studentName || "ยังไม่ได้ระบุ";
  ui["student-section"].textContent = config.section || "ยังไม่ได้ระบุ";
  if (bank.isAddress(address)) {
    ui["contract-link"].href = explorer + "/address/" + address;
    ui["contract-link"].hidden = false;
  }

  function status(message, kind = "", hash) {
    ui.status.textContent = message;
    ui.status.closest("section").dataset.state = kind;
    ui["tx-link"].hidden = !hash;
    if (hash) ui["tx-link"].href = explorer + "/tx/" + hash;
  }

  function render() {
    ui.wallet.textContent = session?.account.address ?? walletAddress ?? "ยังไม่ได้เชื่อมต่อ";
    ui.connect.textContent = session ? "ล็อกกระเป๋า" :
      walletAddress ? "ลองเชื่อมอีกครั้ง" : "เชื่อม MetaMask";
    ui.connect.disabled = busy;
    ui["connect-infura"].disabled = busy || Boolean(session);
    for (const button of [ui.deposit, ui.withdraw, ui.refresh]) button.disabled = busy || !session;
    ui.amount.disabled = busy;
    for (const id of ["create-wallet", "open-wallet", "import-wallet", "close-setup", "wallet-password", "wallet-file", "wallet-key"]) {
      ui[id].disabled = busy;
    }
  }

  function clearBalances() {
    ui.balance.textContent = "—";
    ui["wallet-balance"].textContent = "—";
    ui.amount.value = "";
  }

  function finish() {
    busy = false;
    render();
    if (walletUpdatePending) {
      walletUpdatePending = false;
      return syncMetaMask();
    }
  }

  async function refreshBalances(block = "latest") {
    const { web3, contract, account } = session;
    const results = await Promise.allSettled([
      contract.methods.checkBlance().call({ from: account.address }, block),
      web3.eth.getBalance(account.address, block),
    ]);
    for (const [index, output] of [ui.balance, ui["wallet-balance"]].entries()) {
      const result = results[index];
      output.textContent = result.status === "fulfilled" ? bank.formatAmount(result.value) : "—";
    }
    return results.every(result => result.status === "fulfilled");
  }

  async function connectInfura() {
    if (!window.Web3) throw new Error("โหลด Web3.js ไม่ได้ กรุณารีเฟรชหน้าเว็บ");
    if (!bank.isAddress(address)) throw new Error("กรุณาตรวจสอบที่อยู่สัญญาใน config.js");
    const apiKey = config.infuraApiKey.trim();
    if (!/^[a-f0-9]{32}$/i.test(apiKey)) {
      throw new Error("กรุณาตั้ง Infura API key สำหรับ Sepolia ใน config.js");
    }
    const url = "https://sepolia.infura.io/v3/" + apiKey;
    const web3 = new Web3(new Web3.providers.HttpProvider(url));
    const deadline = AbortSignal.timeout(12000);
    let chainId;
    let code;
    let abi;
    try {
      const response = await fetch("./Bank.abi.json", { signal: deadline });
      if (!response.ok) throw new Error();
      abi = await response.json();
    } catch {
      throw new Error("โหลด Bank.abi.json ไม่ได้ กรุณาเปิดเว็บผ่าน HTTP หรือ HTTPS");
    }
    try {
      [chainId, code] = await Promise.all([web3.eth.getChainId(), web3.eth.getCode(address)]);
    } catch {
      throw new Error("เชื่อม Infura ไม่สำเร็จ กรุณาตรวจสอบคีย์และสิทธิ์ใช้งาน Sepolia");
    }
    if (chainId !== BigInt(bank.chainId) || code === "0x") {
      throw new Error("ไม่พบสัญญา Bank ตามที่อยู่ที่ตั้งไว้บน Sepolia");
    }
    return { web3, contract: new web3.eth.Contract(abi, address) };
  }

  function downloadWallet(keystore, account) {
    const blob = new Blob([JSON.stringify(keystore)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "violet-sepolia-" + account.address + ".json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  async function openWallet(web3, file, password) {
    if (!file || file.size > 128_000) throw new Error("กรุณาเลือกไฟล์กระเป๋า JSON ที่ถูกต้อง");
    try {
      const keystore = JSON.parse(await file.text());
      const crypto = keystore.crypto ?? keystore.Crypto;
      const { n, r, p, c, dklen } = crypto.kdfparams;
      const validScrypt = crypto.kdf === "scrypt" && Number.isInteger(n) && n > 1 && n <= 262144 &&
        Number.isInteger(r) && r > 0 && r <= 8 && Number.isInteger(p) && p > 0 && p <= 8 &&
        n * r * p <= 2097152;
      const validPbkdf2 = crypto.kdf === "pbkdf2" && Number.isInteger(c) && c > 0 && c <= 1000000;
      if (keystore.version !== 3 || dklen !== 32 || (!validScrypt && !validPbkdf2)) throw new Error();
      return await web3.eth.accounts.decrypt(keystore, password);
    } catch {
      throw new Error("เปิดไฟล์กระเป๋าไม่ได้ กรุณาตรวจสอบไฟล์และรหัสผ่าน");
    }
  }

  async function syncMetaMask(prompt = false) {
    if (!followMetaMask || !metaMask) return;
    if (busy) {
      walletUpdatePending = true;
      return;
    }
    const provider = metaMask;
    const previous = session;
    const hadWallet = Boolean(walletAddress);
    session = undefined;
    walletAddress = undefined;
    clearBalances();
    busy = true;
    render();
    try {
      let [account] = await provider.request({ method: prompt && !hadWallet ? "eth_requestAccounts" : "eth_accounts" });
      if (prompt && hadWallet && !account) {
        [account] = await provider.request({ method: "eth_requestAccounts" });
      }
      walletAddress = bank.isAddress(account) ? account : undefined;
      if (!bank.isAddress(account)) {
        status("เชื่อม MetaMask เพื่อใช้บัญชี Sepolia เดิม");
        return;
      }
      let chainId = await provider.request({ method: "eth_chainId" });
      if (prompt && chainId !== bank.chainId) {
        await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: bank.chainId }] });
        chainId = await provider.request({ method: "eth_chainId" });
      }
      if (chainId !== bank.chainId) {
        status("กรุณาเลือก Sepolia ใน MetaMask", "error");
        return;
      }
      let connection;
      try {
        connection = previous?.provider === provider ? previous : await connectInfura();
      } catch (error) {
        status("เชื่อม MetaMask แล้ว แต่ " + error.message, "error");
        return;
      }
      session = { ...connection, account: { address: account }, provider };
      if (walletUpdatePending) return;
      const updated = await refreshBalances();
      status(updated ? "เชื่อม MetaMask แล้ว · อ่านยอดผ่าน Infura" : "เชื่อม MetaMask แล้ว แต่โหลดยอดได้ไม่ครบ",
        updated ? "success" : "error");
    } catch (error) {
      const code = Number(error.code);
      const message = code === 4001 ? "คุณยกเลิกการอนุญาตใน MetaMask" :
        code === 4902 ? "กรุณาเปิด Sepolia ใน MetaMask แล้วลองอีกครั้ง" :
        code === -32002 ? "มีคำขอค้างอยู่ กรุณาเปิด MetaMask แล้วกดยืนยัน" :
        "เปิด MetaMask และปลดล็อกกระเป๋า แล้วลองเชื่อมใหม่";
      status(message, "error");
    } finally {
      await finish();
    }
  }

  ui.connect.addEventListener("click", () => {
    if (!session) {
      if (window.location?.protocol === "file:") {
        status("กรุณาเปิดผ่าน localhost หรือ GitHub Pages แทนการดับเบิลคลิก index.html", "error");
        return;
      }
      if (!metaMask) discoverInjectedMetaMask();
      if (!metaMask) {
        status("เว็บนี้ไม่พบ MetaMask กรุณาเปิด URL นี้ใน Chrome ที่ติดตั้งและเปิดใช้งาน MetaMask", "error");
        return;
      }
      followMetaMask = true;
      return syncMetaMask(true);
    }
    followMetaMask = false;
    walletAddress = undefined;
    session.web3.eth.accounts.wallet.clear();
    session = undefined;
    clearBalances();
    status("ล็อกกระเป๋าแล้ว");
    render();
  });

  ui["connect-infura"].addEventListener("click", () => {
    if (busy || session) return;
    followMetaMask = false;
    walletAddress = undefined;
    render();
    ui.setup.showModal();
  });
  ui["close-setup"].addEventListener("click", () => ui.setup.close());
  ui.setup.addEventListener("cancel", event => { if (busy) event.preventDefault(); });
  ui.setup.addEventListener("close", () => {
    ui["setup-form"].reset();
    ui["import-form"].reset();
    ui["setup-status"].textContent = "";
  });
  async function connectAccount(event) {
    event.preventDefault();
    if (busy) return;
    const mode = event.currentTarget === ui["import-form"] ? "import" : event.submitter?.value ?? "open";
    const create = mode === "create";
    const password = ui["wallet-password"].value;
    const file = ui["wallet-file"].files[0];
    let privateKey;
    if (mode === "import") {
      const raw = ui["wallet-key"].value.trim();
      ui["wallet-key"].value = "";
      if (!/^(?:0x)?[a-f0-9]{64}$/i.test(raw)) {
        ui["setup-status"].textContent = "กรุณาใส่ Private key ของบัญชีทดสอบให้ถูกต้อง";
        return;
      }
      privateKey = "0x" + raw.replace(/^0x/i, "");
    }
    if (create && password.length < 12) {
      ui["setup-status"].textContent = "ตั้งรหัสผ่านอย่างน้อย 12 ตัวอักษร";
      return;
    }
    if (mode === "open" && !file) {
      ui["setup-status"].textContent = "กรุณาเลือกไฟล์กระเป๋า JSON";
      return;
    }

    busy = true;
    render();
    ui["setup-status"].textContent = "กำลังเชื่อม Infura…";
    try {
      const { web3, contract } = await connectInfura();
      let account;
      if (create) {
        account = web3.eth.accounts.create();
        try {
          downloadWallet(await account.encrypt(password), account);
        } catch {
          throw new Error("สร้างไฟล์สำรองกระเป๋าไม่สำเร็จ");
        }
      } else if (mode === "import") {
        try {
          account = web3.eth.accounts.privateKeyToAccount(privateKey);
        } catch {
          throw new Error("Private key ของบัญชีทดสอบไม่ถูกต้อง");
        } finally {
          privateKey = undefined;
        }
      } else {
        account = await openWallet(web3, file, password);
      }
      web3.eth.accounts.wallet.add(account);
      session = { web3, contract, account: web3.eth.accounts.wallet.get(account.address) };
      ui.setup.close();
      const updated = await refreshBalances();
      if (!updated) status("เชื่อมต่อแล้ว แต่โหลดยอดได้ไม่ครบ กรุณากดตรวจสอบยอด", "error");
      else if (create) status(connectedMessage + " เก็บไฟล์กระเป๋าที่ดาวน์โหลดไว้ แล้วเติม Sepolia ETH ที่ที่อยู่ด้านบน", "success");
      else status(connectedMessage, "success");
    } catch (error) {
      ui["setup-status"].textContent = error.message;
    } finally {
      await finish();
    }
  }
  ui["setup-form"].addEventListener("submit", connectAccount);
  ui["import-form"].addEventListener("submit", connectAccount);

  ui.refresh.addEventListener("click", async () => {
    if (busy || !session) return;
    busy = true;
    render();
    try {
      if (await refreshBalances()) status("อัปเดตยอดผ่าน Infura แล้ว", "success");
      else status("โหลดยอดได้ไม่ครบ กรุณาลองใหม่", "error");
    } finally {
      await finish();
    }
  });

  ui["transfer-form"].addEventListener("submit", event => event.preventDefault());
  const negativeSign = /[-−﹣－]/;
  ui.amount.addEventListener("beforeinput", event => {
    if (event.data && negativeSign.test(event.data)) {
      event.preventDefault();
      status("กรุณากรอกจำนวนเงินที่มากกว่า 0", "error");
    }
  });
  ui.amount.addEventListener("input", () => {
    if (negativeSign.test(ui.amount.value)) {
      ui.amount.value = "";
      status("กรุณากรอกจำนวนเงินที่มากกว่า 0", "error");
    }
  });

  async function waitForReceipt(web3, hash) {
    for (let attempt = 0; attempt < 90; attempt++) {
      const receipt = await web3.eth.getTransactionReceipt(hash);
      if (receipt) return receipt;
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    throw new Error("Transaction still pending");
  }

  async function transact(action) {
    if (busy || !session) return;
    let wei;
    try {
      wei = bank.parseAmount(ui.amount.value);
    } catch (error) {
      status(error.message, "error");
      return;
    }

    const { web3, contract, account, provider } = session;
    const from = account.address;
    const deposit = action === "deposit";
    const label = deposit ? "ฝากเงิน" : "ถอนเงิน";
    const value = deposit ? wei : 0n;
    let hash;
    busy = true;
    render();
    try {
      const walletBalance = await web3.eth.getBalance(from);
      if (deposit && wei > walletBalance) {
        status("ยอดในกระเป๋าไม่พอฝาก กรุณาลดจำนวนเงิน", "error");
        return;
      }
      if (!deposit && wei > await contract.methods.checkBlance().call({ from })) {
        status("จำนวนที่ถอนมากกว่ายอดเงินฝาก", "error");
        return;
      }
      if (walletBalance <= value) {
        status("ยอดในกระเป๋าไม่พอจ่ายค่าธรรมเนียม กรุณาลดจำนวนเงินฝากหรือเติม Sepolia ETH", "error");
        return;
      }

      const method = deposit ? contract.methods.deposit() : contract.methods.withdraw(wei);
      const [gas, gasPrice] = await Promise.all([method.estimateGas({ from, value }), web3.eth.getGasPrice()]);
      const fee = gas * gasPrice;
      if (value + fee > walletBalance) {
        status("ยอดในกระเป๋าไม่พอสำหรับทำรายการและจ่ายค่าธรรมเนียม", "error");
        return;
      }
      const data = method.encodeABI();
      let receipt;
      if (provider) {
        const [[selectedAccount], chainId] = await Promise.all([
          provider.request({ method: "eth_accounts" }),
          provider.request({ method: "eth_chainId" }),
        ]);
        if (walletUpdatePending || chainId !== bank.chainId || selectedAccount?.toLowerCase() !== from.toLowerCase()) {
          walletUpdatePending = true;
          return;
        }
        status("กรุณายืนยันธุรกรรมใน MetaMask");
        hash = await provider.request({
          method: "eth_sendTransaction",
          params: [{ from, to: address, data, value: "0x" + value.toString(16), chainId: bank.chainId }],
        });
        status("ส่งธุรกรรมแล้ว กำลังรอ Sepolia ยืนยัน…", "", hash);
        receipt = await waitForReceipt(web3, hash);
      } else {
        if (!window.confirm(label + " " + bank.formatAmount(wei) + " Sepolia ETH\nค่าธรรมเนียมประมาณ " + bank.formatAmount(fee) + " ETH")) {
          status("ยกเลิกรายการแล้ว");
          return;
        }
        const nonce = await web3.eth.getTransactionCount(from, "pending");
        const signed = await account.signTransaction({
          from, to: address, value, data, gas, gasPrice, nonce, chainId: BigInt(bank.chainId), type: 0,
        });
        status("กำลังส่งธุรกรรมผ่าน Infura…");
        receipt = await web3.eth.sendSignedTransaction(signed.rawTransaction).on("transactionHash", txHash => {
          hash = txHash;
          status("ส่งธุรกรรมแล้ว กำลังรอ Sepolia ยืนยัน…", "", hash);
        });
      }
      hash = receipt.transactionHash;
      if (receipt.status !== 1n) {
        status("ธุรกรรมไม่สำเร็จบน Sepolia", "error", hash);
        return;
      }
      ui.amount.value = "";
      const updated = walletUpdatePending || await refreshBalances(receipt.blockNumber);
      status(label + "สำเร็จ" + (updated ? "" : " กรุณากดตรวจสอบยอดอีกครั้ง"), "success", hash);
    } catch (error) {
      if (!hash && Number(error.code) === 4001) {
        status("ยกเลิกรายการใน MetaMask แล้ว");
        return;
      }
      const message = hash
        ? "กรุณาตรวจสถานะธุรกรรมบน Etherscan ก่อนทำรายการอีกครั้ง"
        : "ทำรายการไม่สำเร็จ กรุณาตรวจสอบยอดและการเชื่อมต่อ Infura";
      status(message, "error", hash);
    } finally {
      await finish();
    }
  }

  ui.deposit.addEventListener("click", () => transact("deposit"));
  ui.withdraw.addEventListener("click", () => transact("withdraw"));

  function attachMetaMask(provider) {
    if (typeof provider?.request !== "function" || provider === metaMask) return;
    metaMask = provider;
    const update = () => {
      if (provider === metaMask) return syncMetaMask();
    };
    for (const event of ["accountsChanged", "chainChanged", "connect", "disconnect"]) provider.on?.(event, update);
    return update;
  }

  function discoverInjectedMetaMask() {
    if (metaMask) return;
    const injected = window.ethereum;
    const providers = Array.isArray(injected?.providers) ? injected.providers : [];
    return attachMetaMask(providers.find(provider => provider.isMetaMask) ??
      (injected?.isMetaMask ? injected : undefined));
  }

  render();
  window.addEventListener?.("eip6963:announceProvider", event => {
    if (event.detail?.info?.rdns === "io.metamask") attachMetaMask(event.detail.provider)?.();
  });
  window.addEventListener?.("ethereum#initialized", () => discoverInjectedMetaMask()?.(), { once: true });
  discoverInjectedMetaMask()?.();
  window.dispatchEvent?.(new Event("eip6963:requestProvider"));
})();
