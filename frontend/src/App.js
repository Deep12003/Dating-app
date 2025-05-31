import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import "./App.css";
import DatingAppArtifact from "./DatingApp.json";

const CONTRACT_ADDRESS = "0xbBF3199E208e657919a44fd3b01d45204e59eBd7";
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
  const [isOwner, setIsOwner] = useState(false); // NEW: track if current user is contract owner

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

  // Check if current account is the contract owner
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

  const fetchProfile = async (userAddress) => {
    if (!contract) return null;
    try {
      const data = await contract.getProfile(userAddress);
      return {
        ipfsHash: data.ipfsHash ?? data[0], // fallback if named returns aren't supported
        verified: data.verified ?? data[1],
        active: data.active ?? data[2],
        isPublic: data.isPublic ?? data[3],
      };
    } catch {
      return null;
    }
  };

  const loadAppData = async () => {
    if (!contract || !account) return;

    const userProfile = await fetchProfile(account);
    const users = await contract.getActiveUsers();
    const matchList = await contract.getMatches();

    setProfile(userProfile);
    setActiveUsers(users);
    setMatches(matchList);
  };

  useEffect(() => {
    if (contract && account) {
      loadAppData();
    }
  }, [contract, account]);

  const handleSetProfile = async () => {
    if (!ipfsHash.trim()) return alert("Please provide an IPFS hash.");
    try {
      const tx = await contract.setProfile(ipfsHash.trim(), isPublic);
      await tx.wait();
      alert("Profile updated successfully.");
      const updatedProfile = await fetchProfile(account);
      setProfile(updatedProfile);
      setIpfsHash(""); // Clear input after update
    } catch (error) {
      alert("Failed to set profile: " + (error?.data?.message || error.message));
    }
  };

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
        // message returns [from, timestamp, content]
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

  return (
    <div className="app-container">
      <h1>💘 Decentralized Dating DApp</h1>

      {!account ? (
        <button onClick={connectWallet}>Connect Wallet</button>
      ) : (
        <div>
          <p>
            <strong>Account:</strong> {account}
          </p>

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
      )}
    </div>
  );
}

export default App;
