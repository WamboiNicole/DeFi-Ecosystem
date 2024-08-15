require("dotenv").config();
const { ethers } = require("ethers");
const { abi: TOKEN_IN_ABI } = require("./abis/USDC.json");
const { abi: TOKEN_OUT_ABI } = require("./abis/LINK.json");
const { abi: SWAP_ROUTER_ABI } = require("./abis/UniswapV3Router.json");
const { abi: POOL_ABI } = require("./abis/UniswapV3Pool.json");
const { abi: FACTORY_ABI } = require("./abis/UniswapV3Factory.json");
const { abi: AAVE_LENDING_POOL_ABI } = require("./abis/AaveLendingPool.json");

// Constants
const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
const signer = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
const USDC = {
    address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606EB48", // Replace with USDC address on Sepolia
    decimals: 6,
};
const LINK = {
    address: "0x514910771AF9Ca656af840dff83E8264EcF986CA", // Replace with LINK address on Sepolia
    decimals: 18,
};
const SWAP_ROUTER_CONTRACT_ADDRESS = "0xE592427A0AEce92De3Edee1F18E0157C05861564"; // Uniswap V3 Swap Router on Sepolia
const FACTORY_CONTRACT_ADDRESS = "0x1F98431c8aD98523631AE4a59f267346ea31F984"; // Uniswap V3 Factory on Sepolia
const AAVE_LENDING_POOL_CONTRACT_ADDRESS = "0x7d2768dE32b0b80b7a3454c06Bdac90f169d52B1"; // Aave LendingPool on Sepolia

// Approve Token Function
async function approveToken(tokenAddress, tokenABI, amount, wallet, spenderAddress) {
    try {
        const tokenContract = new ethers.Contract(tokenAddress, tokenABI, wallet);
        const approveAmount = ethers.parseUnits(amount.toString(), USDC.decimals);
        const approveTransaction = await tokenContract.approve.populateTransaction(spenderAddress, approveAmount);
        const transactionResponse = await wallet.sendTransaction(approveTransaction);
        console.log(`Approval Transaction Sent: ${transactionResponse.hash}`);
        const receipt = await transactionResponse.wait();
        console.log(`Approval Transaction Confirmed: https://sepolia.etherscan.io/tx/${receipt.hash}`);
    } catch (error) {
        console.error("Token approval failed:", error);
        throw new Error("Token approval failed");
    }
}

// Get Pool Information Function
async function getPoolInfo(factoryContract, tokenIn, tokenOut) {
    const poolAddress = await factoryContract.getPool(tokenIn.address, tokenOut.address, 3000);
    if (!poolAddress) throw new Error("Failed to get pool address");
    const poolContract = new ethers.Contract(poolAddress, POOL_ABI, provider);
    const [token0, token1, fee] = await Promise.all([poolContract.token0(), poolContract.token1(), poolContract.fee()]);
    return { poolContract, token0, token1, fee };
}

// Prepare Swap Parameters Function
async function prepareSwapParams(poolContract, signer, amountIn) {
    return {
        tokenIn: USDC.address,
        tokenOut: LINK.address,
        fee: await poolContract.fee(),
        recipient: signer.address,
        amountIn: amountIn,
        amountOutMinimum: 0,
        sqrtPriceLimitX96: 0,
    };
}

// Execute Swap Function
async function executeSwap(swapRouter, params, signer) {
    const transaction = await swapRouter.exactInputSingle.populateTransaction(params);
    const receipt = await signer.sendTransaction(transaction);
    console.log(`Swap Transaction Sent: https://sepolia.etherscan.io/tx/${receipt.hash}`);
}

// Deposit to Aave Function
async function depositToAave(lendingPool, tokenAddress, amount, signer) {
    const depositTransaction = await lendingPool.deposit.populateTransaction(tokenAddress, amount, signer.address, 0);
    const transactionResponse = await signer.sendTransaction(depositTransaction);
    console.log(`Aave Deposit Transaction Sent: ${transactionResponse.hash}`);
    const receipt = await transactionResponse.wait();
    console.log(`Aave Deposit Confirmed: https://sepolia.etherscan.io/tx/${receipt.hash}`);
}

// Main Function
async function main(swapAmount) {
    const inputAmount = swapAmount;
    const amountIn = ethers.parseUnits(inputAmount.toString(), USDC.decimals);

    try {
        // Step 1: Approve USDC
        await approveToken(USDC.address, TOKEN_IN_ABI, inputAmount, signer, SWAP_ROUTER_CONTRACT_ADDRESS);

        // Step 2: Get Pool Information
        const factoryContract = new ethers.Contract(FACTORY_CONTRACT_ADDRESS, FACTORY_ABI, provider);
        const { poolContract } = await getPoolInfo(factoryContract, USDC, LINK);

        // Step 3: Prepare Swap Params
        const params = await prepareSwapParams(poolContract, signer, amountIn);

        // Step 4: Execute Swap on Uniswap
        const swapRouter = new ethers.Contract(SWAP_ROUTER_CONTRACT_ADDRESS, SWAP_ROUTER_ABI, signer);
        await executeSwap(swapRouter, params, signer);

        // Step 5: Approve LINK for Aave
        const amountOut = params.amountIn; // Adjust this based on actual received amount
        await approveToken(LINK.address, TOKEN_OUT_ABI, amountOut, signer, AAVE_LENDING_POOL_CONTRACT_ADDRESS);

        // Step 6: Deposit LINK into Aave
        const lendingPool = new ethers.Contract(AAVE_LENDING_POOL_CONTRACT_ADDRESS, AAVE_LENDING_POOL_ABI, signer);
        await depositToAave(lendingPool, LINK.address, amountOut, signer);
    } catch (error) {
        console.error("An error occurred:", error.message);
    }
}

// Run the Main Function
main(1); // Example: Swapping 1 USDC to LINK and depositing into Aave
