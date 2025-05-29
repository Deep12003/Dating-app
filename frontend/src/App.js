import React, { useState, useEffect } from "react";
import { Web3Provider } from "@ethersproject/providers";
import { Contract } from "ethers";
import DatingAppArtifact from "./DatingApp.json";

const CONTRACT_ADDRESS = "0x3EC3cD0A08708C4FCE11eCfD4d9ebfde2C743D4c";
const CONTRACT_ABI = DatingAppArtifact.abi;

const App = () => {
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [contract, setContract] = useState(null);
  const [account, setAccount] = useState("");
  const [ipfsHash, setIpfsHash] = useState("");
  const [targetAddress, setTargetAddress] = useState("");
  const [adminTarget, setAdminTarget] = useState("");

  useEffect(() => {
    connectWallet();
  }, []);

  const connectWallet = async () => {
    try {
      if (!window.ethereum) {
        alert("MetaMask is required!");
        return;
      }
      const tempProvider = new Web3Provider(window.ethereum);
      await tempProvider.send("eth_requestAccounts", []);
      const tempSigner = tempProvider.getSigner();
      const address = await tempSigner.getAddress();
      const tempContract = new Contract(CONTRACT_ADDRESS, CONTRACT_ABI, tempSigner);

      setProvider(tempProvider);
      setSigner(tempSigner);
      setAccount(address);
      setContract(tempContract);
    } catch (error) {
      console.error("Failed to connect wallet:", error);
      alert("Wallet connection failed.");
    }
  };

  // Centralized tx handler with proper wait and error handling
  const handleTransaction = async (txPromise, successMessage) => {
    try {
      const txResponse = await txPromise;
      if (!txResponse || !txResponse.wait) {
        throw new Error("Invalid transaction response");
      }
      const receipt = await txResponse.wait(1);
      console.log(`Tx confirmed with ${receipt.confirmations} confirmations`);
      alert(successMessage);
    } catch (error) {
      console.error("Transaction failed:", error);
      alert(`Transaction failed: ${error.message || error}`);
    }
  };

  // Profile actions
  const handleSetProfile = async () => {
    if (!ipfsHash.trim()) {
      alert("Please enter a valid IPFS hash");
      return;
    }
    await handleTransaction(contract.setProfile(ipfsHash), "Profile set/updated");
  };

  const handleDeleteProfile = async () => {
    await handleTransaction(contract.deleteProfile(), "Profile deleted");
  };

  const handleGetProfile = async () => {
    try {
      const profile = await contract.profiles(account);
      alert(JSON.stringify(profile));
    } catch (error) {
      console.error("Failed to get profile:", error);
      alert("Failed to get profile.");
    }
  };

  // Like / Unlike / Match
  const handleLike = async () => {
    if (!targetAddress.trim()) {
      alert("Please enter a target address");
      return;
    }
    await handleTransaction(contract.likeUser(targetAddress), "User liked");
  };

  const handleUnlike = async () => {
    if (!targetAddress.trim()) {
      alert("Please enter a target address");
      return;
    }
    await handleTransaction(contract.unlikeUser(targetAddress), "User unliked");
  };

  const handleIsMatch = async () => {
    if (!targetAddress.trim()) {
      alert("Please enter a target address");
      return;
    }
    try {
      const matched = await contract.isMatch(account, targetAddress);
      alert(`Matched: ${matched}`);
    } catch (error) {
      console.error("Failed to check match:", error);
      alert("Failed to check match.");
    }
  };

  // Block / Unblock
  const handleBlock = async () => {
    if (!targetAddress.trim()) {
      alert("Please enter a target address");
      return;
    }
    await handleTransaction(contract.blockUser(targetAddress), "User blocked");
  };

  const handleUnblock = async () => {
    if (!targetAddress.trim()) {
      alert("Please enter a target address");
      return;
    }
    await handleTransaction(contract.unblockUser(targetAddress), "User unblocked");
  };

  const handleIsBlocked = async () => {
    if (!targetAddress.trim()) {
      alert("Please enter a target address");
      return;
    }
    try {
      const isBlocked = await contract.isBlocked(account, targetAddress);
      alert(`Blocked: ${isBlocked}`);
    } catch (error) {
      console.error("Failed to check block status:", error);
      alert("Failed to check block status.");
    }
  };

  // Admin functions
  const handleVerify = async () => {
    if (!adminTarget.trim()) {
      alert("Please enter admin target address");
      return;
    }
    await handleTransaction(contract.verifyUser(adminTarget), "User verified");
  };

  const handleBlacklist = async () => {
    if (!adminTarget.trim()) {
      alert("Please enter admin target address");
      return;
    }
    await handleTransaction(contract.blacklistUser(adminTarget), "User blacklisted");
  };

  const handleWhitelist = async () => {
    if (!adminTarget.trim()) {
      alert("Please enter admin target address");
      return;
    }
    await handleTransaction(contract.whitelistUser(adminTarget), "User whitelisted");
  };

  return (
    <div style={{ padding: "2rem", fontFamily: "Arial" }}>
      <h2>🖤 Dating App Interface</h2>
      <p>Connected as: {account || "Not connected"}</p>

      <hr />
      <h3>👤 Profile</h3>
      <input
        type="text"
        placeholder="Enter IPFS hash"
        value={ipfsHash}
        onChange={(e) => setIpfsHash(e.target.value)}
        style={{ width: "300px", marginRight: "10px" }}
      />
      <button onClick={handleSetProfile}>Set / Update Profile</button>
      <button onClick={handleDeleteProfile} style={{ marginLeft: "10px" }}>
        Delete Profile
      </button>
      <button onClick={handleGetProfile} style={{ marginLeft: "10px" }}>
        View Profile
      </button>

      <hr />
      <h3>❤️ Like / Match / Block</h3>
      <input
        type="text"
        placeholder="Target Address"
        value={targetAddress}
        onChange={(e) => setTargetAddress(e.target.value)}
        style={{ width: "300px", marginRight: "10px" }}
      />
      <div style={{ marginTop: "0.5rem" }}>
        <button onClick={handleLike}>Like</button>
        <button onClick={handleUnlike} style={{ marginLeft: "10px" }}>
          Unlike
        </button>
        <button onClick={handleIsMatch} style={{ marginLeft: "10px" }}>
          Check Match
        </button>
      </div>
      <div style={{ marginTop: "0.5rem" }}>
        <button onClick={handleBlock}>Block</button>
        <button onClick={handleUnblock} style={{ marginLeft: "10px" }}>
          Unblock
        </button>
        <button onClick={handleIsBlocked} style={{ marginLeft: "10px" }}>
          Check Block Status
        </button>
      </div>

      <hr />
      <h3>🛡️ Admin Functions</h3>
      <input
        type="text"
        placeholder="Admin Target Address"
        value={adminTarget}
        onChange={(e) => setAdminTarget(e.target.value)}
        style={{ width: "300px", marginRight: "10px" }}
      />
      <div style={{ marginTop: "0.5rem" }}>
        <button onClick={handleVerify}>Verify User</button>
        <button onClick={handleBlacklist} style={{ marginLeft: "10px" }}>
          Blacklist User
        </button>
        <button onClick={handleWhitelist} style={{ marginLeft: "10px" }}>
          Whitelist User
        </button>
      </div>
    </div>
  );
};

export default App;
