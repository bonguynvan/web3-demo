// Auto-generated contract address config for frontend integration
// After deploy, run `node scripts/export-abi.mjs` to populate deployments/localhost.json
// Then update these addresses or load dynamically from the deployment file.

export interface ContractAddresses {
  usdc: `0x${string}`;
  weth: `0x${string}`;
  wbtc: `0x${string}`;
  ethOracle: `0x${string}`;
  btcOracle: `0x${string}`;
  plp: `0x${string}`;
  priceFeed: `0x${string}`;
  vault: `0x${string}`;
  positionManager: `0x${string}`;
  router: `0x${string}`;
}

// Populated from Anvil deploy (deterministic addresses with default deployer)
// These are stable as long as deploy order doesn't change.
export const LOCALHOST_ADDRESSES: ContractAddresses = {
  usdc: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
  weth: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
  wbtc: "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0",
  ethOracle: "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9",
  btcOracle: "0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9",
  plp: "0xa513E6E4b8f2a923D98304ec87F64353C4D5C853",
  priceFeed: "0x2279B7A0a67DB372996a5FaB50D91eAA73d2eBe6",
  vault: "0x0DCd1Bf9A1b36cE34237eEaFef220932846BCD82",
  positionManager: "0x0B306BF915C4d645ff596e518fAf3F9669b97016",
  router: "0x3Aa5ebB10DC797CAC828524e59A333d0A371443c",
};

// Chain-specific address map
export const ADDRESSES: Record<number, ContractAddresses> = {
  31337: LOCALHOST_ADDRESSES,
};

export function getAddresses(chainId: number): ContractAddresses {
  const addresses = ADDRESSES[chainId];
  if (!addresses) {
    throw new Error(`No contract addresses configured for chainId ${chainId}`);
  }
  return addresses;
}
