import React, { useEffect, useState, useCallback } from "react"; 
import { ethers } from "ethers";

import "./App.css";
import DatingAppArtifact from "./DatingApp.json";

const CONTRACT_ADDRESS = "0x6760860a1dF20098D65Ae3649b37751a35b7A0cE";
const CONTRACT_ABI = DatingAppArtifact.abi;

// Move API keys to environment variables for security
const PINATA_API_KEY = process.env.REACT_APP_PINATA_API_KEY || '12ae84e777956c6c830c';
const PINATA_API_SECRET = process.env.REACT_APP_PINATA_API_SECRET || '08ae6d9ceeb028636da754ee2fd641715f67678cc9c05bb1f12240bb22be87c4';

function App() {
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [contract, setContract] = useState(null);
  const [account, setAccount] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [profile, setProfile] = useState(null);
  const [ipfsHash, setIpfsHash] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [activeUsers, setActiveUsers] = useState([]);
  const [matches, setMatches] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messageInput, setMessageInput] = useState("");
  const [isOwner, setIsOwner] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  
  // Error handling utility
  const handleError = (error, customMessage = "An error occurred") => {
    console.error(error);
    const errorMessage = error?.data?.message || error?.message || customMessage;
    setError(errorMessage);
    alert(errorMessage);
  };

  // Clear error after 5 seconds
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);
  
  const connectWallet = async () => {
    if (!window.ethereum) {
      handleError(new Error("MetaMask not installed"), "Please install MetaMask to continue.");
      return;
    }

    try {
      setLoading(true);
      const _provider = new ethers.BrowserProvider(window.ethereum);
      await window.ethereum.request({ method: "eth_requestAccounts" });
      const _signer = await _provider.getSigner();
      const _account = await _signer.getAddress();
      const _contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, _signer);

      setProvider(_provider);
      setSigner(_signer);
      setAccount(_account);
      setContract(_contract);
      
      // Check if user is owner
      try {
        const ownerAddress = await _contract.owner();
        setIsOwner(ownerAddress.toLowerCase() === _account.toLowerCase());
      } catch (err) {
        console.warn("Could not check owner status:", err);
        setIsOwner(false);
      }
    } catch (error) {
      handleError(error, "Error connecting wallet");
    } finally {
      setLoading(false);
    }
  };

  // Auto-connect wallet if previously connected
  useEffect(() => {
    const autoConnect = async () => {
      if (window.ethereum && window.ethereum.selectedAddress) {
        await connectWallet();
      }
    };
    autoConnect();
  }, []);

  const fetchProfile = useCallback(async (userAddress) => {
    if (!contract) return null;
    try {
      const data = await contract.getProfile(userAddress);
      return {
        ipfsHash: data.ipfsHash ?? data[0],
        verified: data.verified ?? data[1],
        active: data.active ?? data[2],
        isPublic: data.isPublic ?? data[3],
      };
    } catch (error) {
      console.warn(`Could not fetch profile for ${userAddress}:`, error);
      return null;
    }
  }, [contract]);

  const loadAppData = useCallback(async () => {
    if (!contract || !account) return;

    try {
      setLoading(true);
      
      // Load user profile
      const userProfile = await fetchProfile(account);
      setProfile(userProfile);

      // Load active users
      try {
        const users = await contract.getActiveUsers();
        const activeProfiles = [];
        
        for (const userAddress of users) {
          const prof = await fetchProfile(userAddress);
          if (prof && prof.active) {
            activeProfiles.push(userAddress);
          }
        }
        
        setActiveUsers(activeProfiles);
      } catch (error) {
        console.warn("Could not load active users:", error);
        setActiveUsers([]);
      }

      // Load matches
      try {
        const matchList = await contract.getMatches();
        setMatches(matchList);
      } catch (error) {
        if (
          error?.reason === "Profile inactive or not found" ||
          error?.message?.includes("Profile inactive or not found")
        ) {
          setMatches([]);
        } else {
          console.warn("Could not load matches:", error);
          setMatches([]);
        }
      }
    } catch (error) {
      handleError(error, "Failed to load app data");
    } finally {
      setLoading(false);
    }
  }, [contract, account, fetchProfile]);

  useEffect(() => {
    if (contract && account) {
      loadAppData();
    }
  }, [contract, account, loadAppData]);

  // Upload to Pinata with better error handling
  const uploadToPinata = async (file) => {
    if (!file) throw new Error("No file provided");
    
    // Validate file type
    if (!file.type.startsWith('image/')) {
      throw new Error("Please select an image file");
    }
    
    // Validate file size (5MB limit)
    if (file.size > 5 * 1024 * 1024) {
      throw new Error("File size must be less than 5MB");
    }

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
        method: "POST",
        headers: {
          pinata_api_key: PINATA_API_KEY,
          pinata_secret_api_key: PINATA_API_SECRET,
        },
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.details || `Upload failed: ${response.status}`);
      }

      const data = await response.json();
      return data.IpfsHash;
    } catch (error) {
      console.error("Failed to upload image to IPFS:", error);
      throw error;
    }
  };

  const handleSetProfile = async (hashToSet = null) => {
    const hash = hashToSet || ipfsHash.trim();
    
    try {
      setLoading(true);
      const tx = await contract.setProfile(hash, isPublic);
      await tx.wait();
      
      alert("Profile updated successfully.");
      const updatedProfile = await fetchProfile(account);
      setProfile(updatedProfile);
      setIpfsHash("");
    } catch (error) {
      handleError(error, "Failed to set profile");
    } finally {
      setLoading(false);
    }
  };

  const handleUploadImage = async () => {
    if (!selectedFile) {
      alert("Please select a file first");
      return;
    }

    try {
      setUploading(true);
      const hash = await uploadToPinata(selectedFile);
      await handleSetProfile(hash);
      setSelectedFile(null);
      alert("Image uploaded and profile updated!");
    } catch (error) {
      handleError(error, "Error uploading image");
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteProfile = async () => {
    if (!window.confirm("Are you sure you want to delete your profile picture?")) return;
    
    try {
      await handleSetProfile("");
      alert("Profile image deleted.");
    } catch (error) {
      handleError(error, "Failed to delete profile image");
    }
  };

  const handleVerifyUser = async (userAddress) => {
    if (!window.confirm(`Verify user ${userAddress}?`)) return;
    
    try {
      setLoading(true);
      const tx = await contract.verifyUser(userAddress);
      await tx.wait();
      alert(`User ${userAddress} verified.`);
      await loadAppData();
    } catch (error) {
      handleError(error, "Error verifying user");
    } finally {
      setLoading(false);
    }
  };

  const handleLikeUser = async (userAddress) => {
    if (userAddress.toLowerCase() === account.toLowerCase()) {
      alert("You cannot like yourself.");
      return;
    }
    
    try {
      setLoading(true);
      const tx = await contract.likeUser(userAddress);
      await tx.wait();
      alert("User liked successfully.");
      
      const updatedMatches = await contract.getMatches();
      setMatches(updatedMatches);
    } catch (error) {
      handleError(error, "Error liking user");
    } finally {
      setLoading(false);
    }
  };

  const handleUnlikeUser = async (userAddress) => {
    try {
      setLoading(true);
      const tx = await contract.unlikeUser(userAddress);
      await tx.wait();
      alert("Like removed.");
      
      const updatedMatches = await contract.getMatches();
      setMatches(updatedMatches);
    } catch (error) {
      handleError(error, "Error unliking user");
    } finally {
      setLoading(false);
    }
  };

  const handleSendMessage = async () => {
    if (!messageInput.trim()) {
      alert("Message cannot be empty.");
      return;
    }
    if (!selectedUser) {
      alert("Please select a user to send message.");
      return;
    }
    
    try {
      const tx = await contract.sendMessage(selectedUser, messageInput.trim());
      await tx.wait();
      setMessageInput("");
      await loadMessages(selectedUser);
    } catch (error) {
      handleError(error, "Message send failed");
    }
  };

  const handleClearChat = async () => {
    if (!selectedUser) {
      alert("No user selected.");
      return;
    }
    if (!window.confirm(`Are you sure you want to clear chat with ${selectedUser}?`)) return;

    try {
      const tx = await contract.clearChat(selectedUser);
      await tx.wait();
      alert("Chat cleared.");
      setMessages([]);
    } catch (error) {
      handleError(error, "Failed to clear chat");
    }
  };

  const loadMessages = useCallback(async (peerAddress) => {
    if (!contract || !account || !peerAddress) return;

    try {
      const messageCount = await contract.getMessageCount(account, peerAddress);
      const messageList = [];

      for (let i = 0; i < messageCount; i++) {
        const message = await contract.getMessage(account, peerAddress, i);
        
        let timestampRaw = message[1];
        let timestampNum;

        if (timestampRaw && typeof timestampRaw.toString === "function") {
          timestampNum = Number(timestampRaw.toString());
        } else {
          timestampNum = Number(timestampRaw);
        }

        if (isNaN(timestampNum)) {
          console.warn("Invalid timestamp:", timestampRaw);
          timestampNum = Date.now() / 1000; 
        }

        messageList.push({
          from: message[0],
          timestamp: new Date(timestampNum * 1000).toLocaleString(),
          content: message[2],
        });
      }

      setMessages(messageList);
    } catch (error) {
      console.warn("Failed to load messages:", error);
    }
  }, [contract, account]);

  const handleBlockUser = async (userAddress) => {
    if (!window.confirm(`Are you sure you want to block ${userAddress}?`)) return;
    
    try {
      const tx = await contract.blockUser(userAddress);
      await tx.wait();
      alert("User blocked.");
      await loadAppData();
      
      if (selectedUser === userAddress) {
        setSelectedUser(null);
        setMessages([]);
      }
    } catch (error) {
      handleError(error, "Error blocking user");
    }
  };

  const handleUnblockUser = async (userAddress) => {
    try {
      const tx = await contract.unblockUser(userAddress);
      await tx.wait();
      alert("User unblocked.");
      await loadAppData();
    } catch (error) {
      handleError(error, "Error unblocking user");
    }
  };

  const handleTransferOwnership = async () => {
    const newOwner = prompt("Enter the new owner address:");
    if (!newOwner || !ethers.isAddress(newOwner)) {
      alert("Please enter a valid Ethereum address.");
      return;
    }

    if (!window.confirm(`Transfer ownership to ${newOwner}?`)) return;

    try {
      const tx = await contract.transferOwnership(newOwner);
      await tx.wait();
      alert(`Ownership transferred to ${newOwner}`);
      
      const ownerAddress = await contract.owner();
      setIsOwner(ownerAddress.toLowerCase() === account.toLowerCase());
    } catch (error) {
      handleError(error, "Error transferring ownership");
    }
  };
  useEffect(() => {
    if (!contract || !account) return;
    
    let retryCount = 0;
    const maxRetries = 3;
    
    const refreshData = async () => {
      try {
        await loadAppData();
        retryCount = 0; 
      } catch (error) {
        retryCount++;
        console.warn(`Data refresh failed (attempt ${retryCount}):`, error);
        
        if (retryCount >= maxRetries) {
          console.error("Max retries reached for data refresh");
          return;
        }
      }
    };
    
    const interval = setInterval(refreshData, 10000); s
    return () => clearInterval(interval);
  }, [contract, account, loadAppData]);

  useEffect(() => {
    if (!contract || !account || !selectedUser) return;
    
    const interval = setInterval(() => {
      loadMessages(selectedUser);
    }, 5000); 
    
    return () => clearInterval(interval);
  }, [contract, account, selectedUser, loadMessages]);

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  if (!account) {
    return (
      <div className="wallet-connect-wrapper">
        <div className="wallet-connect-box">
          <h1>Dating DApp</h1>
          <img
            src="https://cdn3d.iconscout.com/3d/free/thumb/free-metamask-3d-icon-download-in-png-blend-fbx-gltf-file-formats--blockchain-cryptocurrency-crypto-wallet-software-pack-logos-icons-5326393.png"
            alt="MetaMask Wallet"
            style={{
              width: "150px",
              height: "150px",
              borderRadius: "10px",
              objectFit: "cover",
              margin: "20px 0",
            }}
          />
          <button 
            onClick={connectWallet} 
            disabled={loading}
            style={{
              padding: "12px 24px",
              fontSize: "16px",
              backgroundColor: loading ? "#ccc" : "#007bff",
              color: "white",
              border: "none",
              borderRadius: "8px",
              cursor: loading ? "not-allowed" : "pointer"
            }}
          >
            {loading ? "Connecting..." : "Connect Wallet"}
          </button>
          {error && (
            <div style={{ color: "red", marginTop: "10px", fontSize: "14px" }}>
              {error}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      <header>
        <h1>💘 Dating DApp</h1>
        <p><strong>Account:</strong> {account}</p>
        {loading && <div className="loading">Loading...</div>}
        {error && (
          <div className="error-banner" style={{ 
            backgroundColor: "#f8d7da", 
            color: "#721c24", 
            padding: "10px", 
            borderRadius: "5px", 
            margin: "10px 0" 
          }}>
            {error}
          </div>
        )}
      </header>

      <section className="profile-section">
        <h2>Your Profile</h2>

        {profile ? (
          <div className="profile-info">
            <div className="profile-stats">
              <span><strong>Verified:</strong> {profile.verified ? "✅" : "❌"}</span>
              <span><strong>Public:</strong> {profile.isPublic ? "👁️" : "🔒"}</span>
              <span><strong>Active:</strong> {profile.active ? "🟢" : "🔴"}</span>
            </div>

            {profile.ipfsHash && (
              <div className="profile-image-container">
                <img
                  src={`https://gateway.pinata.cloud/ipfs/${profile.ipfsHash}`}
                  alt="Profile"
                  style={{ 
                    width: 150, 
                    height: 150, 
                    borderRadius: "50%", 
                    objectFit: "cover",
                    border: "3px solid #007bff" 
                  }}
                  onError={(e) => {
                    e.target.style.display = 'none';
                    console.error("Failed to load profile image");
                  }}
                />
                <button 
                  onClick={handleDeleteProfile}
                  style={{
                    marginTop: "10px",
                    backgroundColor: "#dc3545",
                    color: "white",
                    border: "none",
                    padding: "8px 16px",
                    borderRadius: "5px",
                    cursor: "pointer"
                  }}
                >
                  Delete Image
                </button>
              </div>
            )}
          </div>
        ) : (
          <p>No profile found. Please set your profile below.</p>
        )}

        {/* File upload section */}
        {!profile?.ipfsHash && (
          <div className="upload-section" style={{ marginTop: "20px" }}>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setSelectedFile(e.target.files[0])}
              style={{ marginBottom: "10px" }}
            />
            <button 
              onClick={handleUploadImage} 
              disabled={uploading || !selectedFile}
              style={{
                padding: "10px 20px",
                backgroundColor: uploading ? "#ccc" : "#28a745",
                color: "white",
                border: "none",
                borderRadius: "5px",
                cursor: uploading ? "not-allowed" : "pointer"
              }}
            >
              {uploading ? "Uploading..." : "Upload & Set Profile"}
            </button>
          </div>
        )}

        {/* Manual IPFS input */}
        <div className="manual-input-section" style={{ marginTop: "20px", padding: "15px", backgroundColor: "#f8f9fa", borderRadius: "8px" }}>
          <h3>Manual Profile Setup</h3>
          <div style={{ marginBottom: "10px" }}>
            <input
              type="text"
              placeholder="Enter IPFS hash"
              value={ipfsHash}
              onChange={(e) => setIpfsHash(e.target.value)}
              style={{ 
                width: "300px", 
                padding: "8px", 
                marginRight: "10px",
                border: "1px solid #ddd",
                borderRadius: "4px"
              }}
            />
          </div>
          <div style={{ marginBottom: "10px" }}>
            <label>
              <input
                type="checkbox"
                checked={isPublic}
                onChange={() => setIsPublic(!isPublic)}
                style={{ marginRight: "8px" }}
              />
              Make profile public
            </label>
          </div>
          <button 
            onClick={() => handleSetProfile()}
            disabled={loading || !ipfsHash.trim()}
            style={{
              padding: "10px 20px",
              backgroundColor: "#007bff",
              color: "white",
              border: "none",
              borderRadius: "5px",
              cursor: "pointer"
            }}
          >
            Set Profile
          </button>
          {isOwner && (
            <button 
              onClick={handleTransferOwnership}
              style={{
                marginLeft: "10px",
                padding: "10px 20px",
                backgroundColor: "#ffc107",
                color: "black",
                border: "none",
                borderRadius: "5px",
                cursor: "pointer"
              }}
            >
              Transfer Ownership
            </button>
          )}
        </div>
      </section>

      <section className="users-section">
        <h2>Active Users ({activeUsers.length})</h2>
        {activeUsers.length === 0 ? (
          <p>No active users found.</p>
        ) : (
          <div className="user-grid">
            {activeUsers.map((user) => (
              <div key={user} className="user-card" style={{
                padding: "15px",
                margin: "10px 0",
                border: "1px solid #ddd",
                borderRadius: "8px",
                backgroundColor: user.toLowerCase() === account.toLowerCase() ? "#e3f2fd" : "#fff"
              }}>
                <div className="user-address">
                  <strong>{user}</strong>
                  {user.toLowerCase() === account.toLowerCase() && (
                    <span style={{ color: "#007bff", marginLeft: "8px" }}>(You)</span>
                  )}
                  {matches.some(match => match.toLowerCase() === user.toLowerCase()) && (
                    <span style={{ color: "#28a745", marginLeft: "8px" }}>💚 Matched</span>
                  )}
                </div>

                {user.toLowerCase() !== account.toLowerCase() && (
                  <div className="user-actions" style={{ marginTop: "10px" }}>
                    <button onClick={() => handleLikeUser(user)} disabled={loading}>
                      👍 Like
                    </button>
                    <button onClick={() => handleUnlikeUser(user)} disabled={loading}>
                      👎 Unlike
                    </button>
                    <button
                      onClick={() => {
                        setSelectedUser(user);
                        loadMessages(user);
                      }}
                      style={{ backgroundColor: "#17a2b8", color: "white" }}
                    >
                      💬 Chat
                    </button>
                    <button 
                      onClick={() => handleBlockUser(user)}
                      style={{ backgroundColor: "#dc3545", color: "white" }}
                    >
                      🚫 Block
                    </button>
                    <button onClick={() => handleUnblockUser(user)}>
                      ✅ Unblock
                    </button>
                    {isOwner && (
                      <button 
                        onClick={() => handleVerifyUser(user)}
                        style={{ backgroundColor: "#28a745", color: "white" }}
                      >
                        ✓ Verify
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="chat-section">
        <h2>💬 Chat</h2>
        {selectedUser ? (
          <div className="chat-container">
            <div className="chat-header" style={{
              padding: "10px",
              backgroundColor: "#007bff",
              color: "white",
              borderRadius: "8px 8px 0 0",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center"
            }}>
              <span><strong>Chatting with:</strong> {selectedUser}</span>
              <div>
                <button 
                  onClick={handleClearChat}
                  style={{
                    marginRight: "10px",
                    padding: "5px 10px",
                    backgroundColor: "#dc3545",
                    color: "white",
                    border: "none",
                    borderRadius: "4px",
                    cursor: "pointer"
                  }}
                >
                  Clear Chat
                </button>
                <button 
                  onClick={() => {
                    setSelectedUser(null);
                    setMessages([]);
                  }}
                  style={{
                    padding: "5px 10px",
                    backgroundColor: "#6c757d",
                    color: "white",
                    border: "none",
                    borderRadius: "4px",
                    cursor: "pointer"
                  }}
                >
                  Close
                </button>
              </div>
            </div>
            
            <div className="chat-messages" style={{
              border: "1px solid #ddd",
              borderTop: "none",
              padding: "15px",
              maxHeight: "400px",
              overflowY: "auto",
              backgroundColor: "#f8f9fa",
              minHeight: "200px"
            }}>
              {messages.length === 0 ? (
                <p style={{ textAlign: "center", color: "#6c757d" }}>
                  No messages yet. Start the conversation!
                </p>
              ) : (
                messages.map((msg, idx) => (
                  <div
                    key={idx}
                    style={{
                      marginBottom: "15px",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: msg.from.toLowerCase() === account.toLowerCase() ? "flex-end" : "flex-start",
                    }}
                  >
                    <div
                      style={{
                        backgroundColor: msg.from.toLowerCase() === account.toLowerCase() ? "#007bff" : "#ffffff",
                        color: msg.from.toLowerCase() === account.toLowerCase() ? "white" : "black",
                        padding: "10px 15px",
                        borderRadius: "18px",
                        maxWidth: "70%",
                        wordWrap: "break-word",
                        border: msg.from.toLowerCase() === account.toLowerCase() ? "none" : "1px solid #ddd",
                        boxShadow: "0 1px 2px rgba(0,0,0,0.1)"
                      }}
                    >
                      {msg.content}
                    </div>
                    <small style={{ 
                      color: "#6c757d", 
                      marginTop: "4px",
                      fontSize: "12px"
                    }}>
                      {msg.timestamp}
                    </small>
                  </div>
                ))
              )}
            </div>
            
            <div className="message-input" style={{
              display: "flex",
              padding: "10px",
              backgroundColor: "#fff",
              borderRadius: "0 0 8px 8px",
              border: "1px solid #ddd",
              borderTop: "none"
            }}>
              <input
                type="text"
                value={messageInput}
                onChange={(e) => setMessageInput(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Type your message... (Press Enter to send)"
                style={{ 
                  flex: 1,
                  padding: "10px",
                  border: "1px solid #ddd",
                  borderRadius: "20px",
                  marginRight: "10px",
                  outline: "none"
                }}
              />
              <button 
                onClick={handleSendMessage}
                disabled={!messageInput.trim()}
                style={{
                  padding: "10px 20px",
                  backgroundColor: "#007bff",
                  color: "white",
                  border: "none",
                  borderRadius: "20px",
                  cursor: messageInput.trim() ? "pointer" : "not-allowed"
                }}
              >
                Send
              </button>
            </div>
          </div>
        ) : (
          <div style={{
            padding: "40px",
            textAlign: "center",
            color: "#6c757d",
            backgroundColor: "#f8f9fa",
            borderRadius: "8px"
          }}>
            <p>Select a user from the Active Users section to start chatting! 💬</p>
          </div>
        )}
      </section>
    </div>
  );
}

export default App;
