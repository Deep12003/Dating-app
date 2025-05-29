const { ethers } = require("hardhat");

async function main() {
  const DatingApp = await ethers.getContractFactory("DatingApp");

  // Deploy contract; this returns deployed instance already mined
  const datingApp = await DatingApp.deploy();

  // Immediately safe to use
  console.log("DatingApp deployed to:", datingApp.target);  // ethers v6 uses .target instead of .address
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
