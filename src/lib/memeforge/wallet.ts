import { CLUSTER_RPCS, type Cluster } from "./core";

type Pubkey = { toString(): string; toBase58?: () => string };
type SignedTx = { serialize: () => Uint8Array };

export type InjectedWallet = {
  connect: () => Promise<{ publicKey: Pubkey }>;
  signAndSendTransaction?: (tx: unknown) => Promise<{ signature: string } | string>;
  signTransaction?: (tx: unknown) => Promise<SignedTx>;
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
  if (!provider) throw new Error("No wallet injected. Open Phantom, or paste a signature after signing elsewhere.");
  const connected = await provider.connect();
  return connected.publicKey.toBase58?.() ?? connected.publicKey.toString();
}

export async function sendMemo(memo: string, owner: string, cluster: Cluster): Promise<string> {
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
  let blockhash = "";
  let lastError = `Could not read a recent blockhash on ${cluster}.`;
  for (const url of CLUSTER_RPCS[cluster]) {
    try {
      const connection = new web3.Connection(url, "confirmed");
      const latest = await connection.getLatestBlockhash("confirmed");
      blockhash = latest.blockhash;
      break;
    } catch (error) {
      lastError = error instanceof Error ? error.message : lastError;
    }
  }
  if (!blockhash) throw new Error(lastError);
  const tx = new web3.Transaction();
  tx.feePayer = pubkey;
  tx.recentBlockhash = blockhash as NonNullable<InstanceType<typeof web3.Transaction>["recentBlockhash"]>;
  tx.add(ix);
  if (provider.signTransaction) {
    const signed = await provider.signTransaction(tx);
    const raw = signed.serialize();
    for (const url of CLUSTER_RPCS[cluster]) {
      try {
        const connection = new web3.Connection(url, "confirmed");
        return await connection.sendRawTransaction(raw);
      } catch (error) {
        lastError = error instanceof Error ? error.message : "Send failed";
        if (/reject|denied|cancel/i.test(lastError)) throw error instanceof Error ? error : new Error(lastError);
      }
    }
    throw new Error(lastError);
  }
  if (!provider.signAndSendTransaction) throw new Error("This wallet cannot sign a transaction.");
  const sent = await provider.signAndSendTransaction(tx);
  return typeof sent === "string" ? sent : sent.signature;
}