import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import "./App.css";
import DatingAppArtifact from "./DatingApp.json";

const CONTRACT_ADDRESS = "0x689Ed5B65EC1A834DfEFD0e6b767d8eD49c4B08E";
const CONTRACT_ABI = DatingAppArtifact.abi;

function App() {
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [contract, setContract] = useState(null);
  const [account, setAccount] = useState(null);

  const [profile, setProfile] = useState(null);
  const [ipfsHash, setIpfsHash] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [activeUsers, setActiveUsers] = useState([]);
  const [matches, setMatches] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messageInput, setMessageInput] = useState("");
  const [isOwner, setIsOwner] = useState(false);

  // Connect wallet and initialize provider, signer, contract
  const connectWallet = async () => {
    if (!window.ethereum) {
      alert("Please install MetaMask to continue.");
      return;
    }

    try {
      const _provider = new ethers.BrowserProvider(window.ethereum);
      await window.ethereum.request({ method: "eth_requestAccounts" });
      const _signer = await _provider.getSigner();
      const _account = await _signer.getAddress();
      const _contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, _signer);

      setProvider(_provider);
      setSigner(_signer);
      setAccount(_account);
      setContract(_contract);
    } catch (error) {
      alert("Error connecting wallet: " + error.message);
    }
  };

  // Check if current account is contract owner
  useEffect(() => {
    const checkOwner = async () => {
      if (!contract || !account) return;
      try {
        const ownerAddress = await contract.owner();
        setIsOwner(ownerAddress.toLowerCase() === account.toLowerCase());
      } catch {
        setIsOwner(false);
      }
    };
    checkOwner();
  }, [contract, account]);

  // Fetch a user's profile, with error handling for private/inactive profiles
  const fetchProfile = async (userAddress) => {
    if (!contract) return null;
    try {
      const data = await contract.getProfile(userAddress);
      return {
        ipfsHash: data.ipfsHash ?? data[0],
        verified: data.verified ?? data[1],
        active: data.active ?? data[2],
        isPublic: data.isPublic ?? data[3],
      };
    } catch {
      return null;
    }
  };

  // Load user profile, active users, and matches
  const loadAppData = async () => {
    if (!contract || !account) return;

    const userProfile = await fetchProfile(account);
    setProfile(userProfile);

    try {
      const users = await contract.getActiveUsers();
      setActiveUsers(users);
    } catch {
      setActiveUsers([]);
    }

    try {
      const matchList = await contract.getMatches();
      setMatches(matchList);
    } catch (error) {
      if (
        error?.reason === "Profile inactive or not found" ||
        error?.message.includes("Profile inactive or not found")
      ) {
        setMatches([]);
      } else {
        console.error("Error loading matches:", error);
        setMatches([]);
      }
    }
  };

  useEffect(() => {
    if (contract && account) {
      loadAppData();
    }
  }, [contract, account]);

  // Set or update profile
  const handleSetProfile = async () => {
    if (!ipfsHash.trim()) return alert("Please provide an IPFS hash.");
    try {
      const tx = await contract.setProfile(ipfsHash.trim(), isPublic);
      await tx.wait();
      alert("Profile updated successfully.");
      const updatedProfile = await fetchProfile(account);
      setProfile(updatedProfile);
      setIpfsHash("");
    } catch (error) {
      alert("Failed to set profile: " + (error?.data?.message || error.message));
    }
  };

  // Delete profile
  const handleDeleteProfile = async () => {
    if (!window.confirm("Are you sure you want to delete your profile? This action cannot be undone.")) return;
    try {
      const tx = await contract.deleteProfile();
      await tx.wait();
      alert("Profile deleted.");
      setProfile(null);
      setIpfsHash("");
      loadAppData();
    } catch (error) {
      alert("Error deleting profile: " + (error?.data?.message || error.message));
    }
  };

  // Verify user (owner only)
  const handleVerifyUser = async (userAddress) => {
    if (!window.confirm(`Verify user ${userAddress}?`)) return;
    try {
      const tx = await contract.verifyProfile(userAddress);
      await tx.wait();
      alert(`User ${userAddress} verified.`);
      loadAppData();
    } catch (error) {
      alert("Error verifying user: " + (error?.data?.message || error.message));
    }
  };

  // Like / Unlike user
  const handleLikeUser = async (userAddress) => {
    if (userAddress.toLowerCase() === account.toLowerCase()) return alert("You cannot like yourself.");
    try {
      const tx = await contract.likeUser(userAddress);
      await tx.wait();
      alert("User liked successfully.");
      const updatedMatches = await contract.getMatches();
      setMatches(updatedMatches);
    } catch (error) {
      alert("Error liking user: " + (error?.data?.message || error.message));
    }
  };

  const handleUnlikeUser = async (userAddress) => {
    try {
      const tx = await contract.unlikeUser(userAddress);
      await tx.wait();
      alert("Like removed.");
      const updatedMatches = await contract.getMatches();
      setMatches(updatedMatches);
    } catch (error) {
      alert("Error unliking user: " + (error?.data?.message || error.message));
    }
  };

  // Messaging
  const handleSendMessage = async () => {
    if (!messageInput.trim()) return alert("Message cannot be empty.");
    if (!selectedUser) return alert("Please select a user to send message.");
    try {
      const tx = await contract.sendMessage(selectedUser, messageInput.trim());
      await tx.wait();
      setMessageInput("");
      await loadMessages(selectedUser);
    } catch (error) {
      alert("Message send failed: " + (error?.data?.message || error.message));
    }
  };

  const loadMessages = async (peerAddress) => {
    if (!contract || !account || !peerAddress) return;

    try {
      const messageCount = await contract.getMessageCount(account, peerAddress);
      const messageList = [];

      for (let i = 0; i < messageCount; i++) {
        const message = await contract.getMessage(account, peerAddress, i);
        messageList.push({
          from: message[0],
          timestamp: new Date(message[1].toNumber() * 1000).toLocaleString(),
          content: message[2],
        });
      }

      setMessages(messageList);
    } catch (error) {
      alert("Failed to load messages: " + (error?.data?.message || error.message));
    }
  };

  // Block / Unblock user
  const handleBlockUser = async (userAddress) => {
    try {
      const tx = await contract.blockUser(userAddress);
      await tx.wait();
      alert("User blocked.");
      loadAppData();
      if (selectedUser === userAddress) setSelectedUser(null);
      setMessages([]);
    } catch (error) {
      alert("Error blocking user: " + (error?.data?.message || error.message));
    }
  };

  const handleUnblockUser = async (userAddress) => {
    try {
      const tx = await contract.unblockUser(userAddress);
      await tx.wait();
      alert("User unblocked.");
      loadAppData();
    } catch (error) {
      alert("Error unblocking user: " + (error?.data?.message || error.message));
    }
  };

  // Wallet Connect UI when no account connected
  if (!account) {
  return (
    <div className="wallet-connect-wrapper">
      <div className="wallet-connect-box">
        <h1>Dating DApp</h1>
        <img
          src="https://cdn3d.iconscout.com/3d/free/thumb/free-metamask-3d-icon-download-in-png-blend-fbx-gltf-file-formats--blockchain-cryptocurrency-crypto-wallet-software-pack-logos-icons-5326393.png"
          alt="Dating Illustration"
          style={{
            width: "150px",
            height: "150px",
            borderRadius: "0%",  // Makes image circular
            objectFit: "cover",
            margin: "20px 0",
          }}
        />
        <button onClick={connectWallet}>Connect Wallet</button>
      </div>
    </div>
  );
}

  // Main App JSX
  return (
    <div className="app-container">
      <h1>💘 Decentralized Dating DApp</h1>

      <p><strong>Account:</strong> {account}</p>

      <section>
        <h2>Your Profile</h2>
        {profile ? (
          <>
            <ul>
              <li><strong>IPFS Hash:</strong> {profile.ipfsHash}</li>
              <li><strong>Verified:</strong> {profile.verified ? "Yes" : "No"}</li>
              <li><strong>Public:</strong> {profile.isPublic ? "Yes" : "No"}</li>
              <li><strong>Active:</strong> {profile.active ? "Yes" : "No"}</li>
            </ul>

            <button
              onClick={handleDeleteProfile}
              style={{ marginTop: "10px", backgroundColor: "red", color: "white" }}
            >
              Delete Profile
            </button>
          </>
        ) : (
          <p>No profile found.</p>
        )}

        <div style={{ marginTop: 10 }}>
          <input
            type="text"
            placeholder="Enter IPFS Hash"
            value={ipfsHash}
            onChange={(e) => setIpfsHash(e.target.value)}
          />
          <label style={{ marginLeft: 10 }}>
            <input
              type="checkbox"
              checked={isPublic}
              onChange={() => setIsPublic(!isPublic)}
            />
            Public Profile
          </label>
          <br />
          <button onClick={handleSetProfile}>Update Profile</button>
        </div>
      </section>

      <section>
        <h2>Active Users</h2>
        <ul className="user-list">
          {activeUsers.map((user) => (
            <li key={user}>
              <strong>{user}</strong> {user.toLowerCase() === account.toLowerCase() && "(You)"}
              {user.toLowerCase() !== account.toLowerCase() && (
                <>
                  <button onClick={() => handleLikeUser(user)}>Like</button>
                  <button onClick={() => handleUnlikeUser(user)}>Unlike</button>
                  <button
                    onClick={() => {
                      setSelectedUser(user);
                      loadMessages(user);
                    }}
                  >
                    Chat
                  </button>
                  <button onClick={() => handleBlockUser(user)}>Block</button>
                  <button onClick={() => handleUnblockUser(user)}>Unblock</button>
                  {isOwner && (
                    <button onClick={() => handleVerifyUser(user)}>Verify</button>
                  )}
                  {matches.some(match => match.toLowerCase() === user.toLowerCase()) && (
                    <span style={{ color: "green", marginLeft: 10 }}>Matched</span>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2>Messages {selectedUser && `with ${selectedUser}`}</h2>
        {selectedUser ? (
          <>
            <div className="chat-box">
              {messages.length === 0 ? (
                <p>No messages yet.</p>
              ) : (
                messages.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`message ${msg.from.toLowerCase() === account.toLowerCase() ? "sent" : "received"}`}
                  >
                    <strong>{msg.from.toLowerCase() === account.toLowerCase() ? "You" : msg.from}</strong>: {msg.content}
                    <br />
                    <small>{msg.timestamp}</small>
                  </div>
                ))
              )}
            </div>
            <input
              type="text"
              placeholder="Type a message"
              value={messageInput}
              onChange={(e) => setMessageInput(e.target.value)}
            />
            <button onClick={handleSendMessage}>Send</button>
          </>
        ) : (
          <p>Select a user to start chatting.</p>
        )}
      </section>
    </div>
  );
}

export default App;
