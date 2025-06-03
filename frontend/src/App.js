import React, { useEffect, useState } from "react"; 
import { ethers } from "ethers";
import "./App.css";
import DatingAppArtifact from "./DatingApp.json";

const CONTRACT_ADDRESS = "0x6760860a1dF20098D65Ae3649b37751a35b7A0cE";
const CONTRACT_ABI = DatingAppArtifact.abi;
const PINATA_API_KEY = '12ae84e777956c6c830c';
const PINATA_API_SECRET = '08ae6d9ceeb028636da754ee2fd641715f67678cc9c05bb1f12240bb22be87c4';

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
  const [profileImage, setProfileImage] = useState(null);
  const [selectedFile, setSelectedFile] = React.useState(null);
  
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
        ipfsHash: data.ipfsHash ?? data[0],
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
  setProfile(userProfile);

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
      const tx = await contract.verifyUser(userAddress);
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

const handleClearChat = async () => {
  if (!selectedUser) return alert("No user selected.");
  if (!window.confirm(`Are you sure you want to clear chat with ${selectedUser}?`)) return;

  try {
    const tx = await contract.clearChat(selectedUser);
    await tx.wait();
    alert("Chat cleared.");
    setMessages([]); // Clear chat messages in UI
  } catch (error) {
    alert("Failed to clear chat: " + (error?.data?.message || error.message));
  }
};

  const loadMessages = async (peerAddress) => {
  if (!contract || !account || !peerAddress) return;

  try {
    const messageCount = await contract.getMessageCount(account, peerAddress);
    const messageList = [];

    for (let i = 0; i < messageCount; i++) {
      const message = await contract.getMessage(account, peerAddress, i);
  
      let timestampRaw = message[1];
      let timestampNum;

      if (timestampRaw && typeof timestampRaw.toNumber === "function") {
        timestampNum = timestampRaw.toNumber();
      } else {
      
        timestampNum = Number(timestampRaw);
      }

      messageList.push({
        from: message[0],
        timestamp: new Date(timestampNum * 1000).toLocaleString(),
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

  const handleTransferOwnership = async () => {
  const newOwner = prompt("Enter the new owner address:");
  if (!newOwner) return alert("New owner address is required.");

  try {
    const tx = await contract.transferOwnership(newOwner);
    await tx.wait();
    alert(`Ownership transferred to ${newOwner}`);
    // Re-check ownership status after transfer
    const ownerAddress = await contract.owner();
    setIsOwner(ownerAddress.toLowerCase() === account.toLowerCase());
  } catch (error) {
    alert("Error transferring ownership: " + (error?.data?.message || error.message));
  }
};
const handleUploadImage = async () => {
  if (!selectedFile) {
    alert("Please select a file first");
    return;
  }

  try {
    // Call the reusable upload function here
    const ipfsHash = await uploadToPinata(selectedFile);

    setIpfsHash(ipfsHash);
    await handleSetProfile(ipfsHash);

    alert("Image uploaded and profile updated!");
  } catch (error) {
    console.error("Error uploading image:", error);
    alert("Error uploading image");
  }
};


async function uploadToPinata(file) {
  try {
    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
      method: "POST",
      headers: {
        pinata_api_key: PINATA_API_KEY,
        pinata_secret_api_key: PINATA_API_SECRET,
        // Do NOT set 'Content-Type' header here!
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText);
    }

    const data = await response.json();
    return data.IpfsHash;
  } catch (error) {
    console.error("Failed to upload image to IPFS:", error);
    throw error;
  }
}

  useEffect(() => {
    if (!contract || !account) return;
    const id = setInterval(() => {
      loadAppData();
    }, 5000);
    return () => clearInterval(id);
  }, [contract, account]);

  useEffect(() => {
    if (!contract || !account || !selectedUser) return;
    const id = setInterval(() => {
      loadMessages(selectedUser);
    }, 3000);
    return () => clearInterval(id);
  }, [contract, account, selectedUser]);

  

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
              borderRadius: "0%",
              objectFit: "cover",
              margin: "20px 0",
            }}
          />
          <button onClick={connectWallet}>Connect Wallet</button>
        </div>
      </div>
    );
  }

 
  return (
    <div className="app-container">
      <h1> Dating DApp 💘</h1>

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

      {profile.ipfsHash && (
  <img 
    src={`https://gateway.pinata.cloud/ipfs/${profile.ipfsHash}`} 
    alt="Profile Image" 
    style={{ width: 150, height: 150, borderRadius: "50%" }}
  />
)}

      {/* Display profile image if exists */}
      {profile.ipfsHash && (
        <img
          src={`https://gateway.pinata.cloud/ipfs/${profile.ipfsHash}`}
          alt="Profile Image"
          style={{ width: 150, height: 150, borderRadius: "50%", marginBottom: "10px" }}
        />
      )}

      <button onClick={handleDeleteProfile}>Delete Profile</button>
    </>
  ) : (
    <p>No profile found. Please set your profile.</p>
  )}

  {/* File input for uploading new profile image */}
  <input
    type="file"
    accept="image/*"
    onChange={(e) => setSelectedFile(e.target.files[0])}
    style={{ marginTop: "15px" }}
  />

  <button onClick={handleUploadImage} style={{ marginTop: "10px" }}>
    Upload & Update Profile Image
  </button>

  <hr style={{ margin: "20px 0" }} />

  {/* Optional: You can still keep your manual IPFS hash input and public toggle */}
  <input
    type="text"
    placeholder="Enter IPFS hash"
    value={ipfsHash}
    onChange={(e) => setIpfsHash(e.target.value)}
    style={{ marginRight: "10px" }}
  />
  <label>
    <input
      type="checkbox"
      checked={isPublic}
      onChange={() => setIsPublic(!isPublic)}
      style={{ marginRight: "5px" }}
    />
    Make profile public
  </label>
  <br />
  <button onClick={handleSetProfile} style={{ marginTop: "10px" }}>
    Set / Update Profile
  </button>
</section>

      <section>
        <h2>Active Users</h2>
        <ul className="user-list">
          {activeUsers.map((user) => (
            <li key={user} style={{ marginBottom: "20px", borderBottom: "1px solid #ccc", paddingBottom: "10px" }}>
              <div><strong>{user}</strong> {user.toLowerCase() === account.toLowerCase() && "(You)"}</div>

              {user.toLowerCase() !== account.toLowerCase() && (
                <div
                  style={{
                    marginTop: "6px",
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "10px",
                    alignItems: "center",
                  }}
                >
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
                    <span style={{ color: "green" }}>Matched</span>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2>Chat</h2>
        {selectedUser ? (
          <>
            <p>
              <strong>Chatting with:</strong> {selectedUser}{" "}
              <button onClick={() => {
                setSelectedUser(null);
                setMessages([]);
              }}>Close Chat</button>

              <button onClick={handleClearChat} style={{ marginLeft: "10px" }}>
                Clear Chat
              </button>

              
            </p>
            <div className="chat-box" style={{
              border: "1px solid #ccc",
              borderRadius: "8px",
              padding: "10px",
              maxHeight: "300px",
              overflowY: "auto",
              backgroundColor: "#f9f9f9"
            }}>
              {messages.length === 0 ? (
                <p>No messages yet.</p>
              ) : (
                messages.map((msg, idx) => (
                  <div
                    key={idx}
                    style={{
                      marginBottom: "8px",
                      textAlign: msg.from.toLowerCase() === account.toLowerCase() ? "right" : "left",
                    }}
                  >
                    <small>
                      <strong>{msg.from}</strong> [{msg.timestamp}]
                    </small>
                    <div
                      style={{
                        backgroundColor: msg.from.toLowerCase() === account.toLowerCase() ? "#d1e7dd" : "#f8d7da",
                        display: "inline-block",
                        padding: "6px 10px",
                        borderRadius: "12px",
                        maxWidth: "80%",
                        wordWrap: "break-word",
                      }}
                    >
                      {msg.content}
                    </div>
                  </div>
                ))
              )}
            </div>
            <div style={{ marginTop: "10px" }}>
              <input
                type="text"
                value={messageInput}
                onChange={(e) => setMessageInput(e.target.value)}
                placeholder="Type your message"
                style={{ width: "70%", marginRight: "10px", padding: "6px" }}
              />
              <button onClick={handleSendMessage}>Send</button>
            </div>
          </>
        ) : (
          <p>Select a user and click Chat to start messaging.</p>
        )}
      </section>
    </div>
  );
}

export default App;
