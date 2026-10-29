type Pubkey = { toString(): string; toBase58?: () => string };

export type InjectedWallet = {
  connect: () => Promise<{ publicKey: Pubkey }>;
  signAndSendTransaction: (tx: unknown) => Promise<{ signature: string } | string>;
};

export function injectedWallet(): InjectedWallet | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & {
    phantom?: { solana?: InjectedWallet };
    solana?: InjectedWallet;
  };
  return w.phantom?.solana ?? w.solana ?? null;
}

export async function connectWallet(): Promise<string> {
  const provider = injectedWallet();
  if (!provider) throw new Error("No wallet injected. Open Phantom, or paste a devnet signature after signing elsewhere.");
  const connected = await provider.connect();
  return connected.publicKey.toBase58?.() ?? connected.publicKey.toString();
}

export async function sendMemo(memo: string, owner: string): Promise<string> {
  const provider = injectedWallet();
  if (!provider) throw new Error("No wallet injected.");
  const { Buffer } = await import("buffer");
  const scope = globalThis as typeof globalThis & { Buffer?: typeof Buffer };
  if (!scope.Buffer) scope.Buffer = Buffer;
  const web3 = await import("@solana/web3.js");
  const connected = await provider.connect();
  const address = connected.publicKey.toBase58?.() ?? connected.publicKey.toString();
  if (address !== owner) throw new Error("This wallet is not the owner baked into the memo. Prepare again.");
  const pubkey = new web3.PublicKey(address);
  const ix = new web3.TransactionInstruction({
    keys: [{ pubkey, isSigner: true, isWritable: false }],
    programId: new web3.PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"),
    data: Buffer.from(memo, "utf8"),
  });
  const connection = new web3.Connection("https://api.devnet.solana.com", "confirmed");
  const latest = await connection.getLatestBlockhash("confirmed");
  const tx = new web3.Transaction({
    feePayer: pubkey,
    recentBlockhash: latest.blockhash,
  }).add(ix);
  const sent = await provider.signAndSendTransaction(tx);
  return typeof sent === "string" ? sent : sent.signature;
}
