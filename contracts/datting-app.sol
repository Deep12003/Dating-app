// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract DatingApp {
    // --- Data Structures ---

    struct Profile {
        string ipfsHash;        // IPFS hash of profile metadata
        bool verified;          // Verified flag
        uint256 createdAt;      // Profile creation timestamp
        uint256 updatedAt;      // Last profile update timestamp
        bool active;            // Profile active or deleted
    }

    struct Like {
        bool liked;
        uint256 timestamp;
    }

    struct Blocked {
        bool isBlocked;
        uint256 timestamp;
    }

    // --- Storage ---

    mapping(address => Profile) public profiles;
    mapping(address => mapping(address => Like)) private likes;
    mapping(address => mapping(address => bool)) public matches;
    mapping(address => mapping(address => Blocked)) private blocks;

    // Owner controls blacklisted users
    mapping(address => bool) public blacklist;

    // --- Events ---

    event ProfileCreated(address indexed user, string ipfsHash);
    event ProfileUpdated(address indexed user, string ipfsHash);
    event ProfileDeleted(address indexed user);
    event Verified(address indexed user);
    event LikeSent(address indexed from, address indexed to);
    event LikeRemoved(address indexed from, address indexed to);
    event MatchMade(address indexed user1, address indexed user2);
    event MatchRemoved(address indexed user1, address indexed user2);
    event UserBlocked(address indexed user, address indexed blockedUser);
    event UserUnblocked(address indexed user, address indexed unblockedUser);
    event Blacklisted(address indexed user);
    event Whitelisted(address indexed user);

    // --- Ownership and Access Control ---

    address public owner;

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    modifier hasProfile(address user) {
        require(profiles[user].active, "Profile inactive or not found");
        _;
    }

    modifier notBlacklisted(address user) {
        require(!blacklist[user], "User is blacklisted");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    /// Transfer ownership
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Invalid new owner");
        owner = newOwner;
    }

    /// Blacklist a user (admin only)
    function blacklistUser(address user) external onlyOwner {
        blacklist[user] = true;
        emit Blacklisted(user);
    }

    /// Remove from blacklist
    function whitelistUser(address user) external onlyOwner {
        blacklist[user] = false;
        emit Whitelisted(user);
    }

    // --- Profile Functions ---

    /// Register or update your profile
    function setProfile(string calldata ipfsHash) external notBlacklisted(msg.sender) {
        require(bytes(ipfsHash).length > 0, "IPFS hash required");

        if (profiles[msg.sender].createdAt == 0) {
            // New profile creation
            profiles[msg.sender] = Profile({
                ipfsHash: ipfsHash,
                verified: false,
                createdAt: block.timestamp,
                updatedAt: block.timestamp,
                active: true
            });
            emit ProfileCreated(msg.sender, ipfsHash);
        } else {
            // Updating existing active profile
            require(profiles[msg.sender].active, "Profile deleted");
            profiles[msg.sender].ipfsHash = ipfsHash;
            profiles[msg.sender].updatedAt = block.timestamp;
            emit ProfileUpdated(msg.sender, ipfsHash);
        }
    }

    /// Delete profile (soft delete)
    function deleteProfile() external hasProfile(msg.sender) {
        profiles[msg.sender].active = false;

        // Optional: clear all likes and matches
        // Not done here to save gas; frontend should filter inactive users

        emit ProfileDeleted(msg.sender);
    }

    /// Verify a user (admin only)
    function verifyUser(address user) external onlyOwner hasProfile(user) {
        require(!profiles[user].verified, "Already verified");
        profiles[user].verified = true;
        emit Verified(user);
    }

    // --- Interaction Functions ---

    /// Send a like to another user
    function likeUser(address to) external hasProfile(msg.sender) hasProfile(to) notBlacklisted(msg.sender) notBlacklisted(to) {
        require(msg.sender != to, "Cannot like yourself");
        require(!likes[msg.sender][to].liked, "Already liked");
        require(!blocks[to][msg.sender].isBlocked, "You are blocked by user");
        require(!blocks[msg.sender][to].isBlocked, "You blocked this user");

        likes[msg.sender][to] = Like(true, block.timestamp);
        emit LikeSent(msg.sender, to);

        if (likes[to][msg.sender].liked) {
            matches[msg.sender][to] = true;
            matches[to][msg.sender] = true;
            emit MatchMade(msg.sender, to);
        }
    }

    /// Remove a like (unlike)
    function unlikeUser(address to) external hasProfile(msg.sender) hasProfile(to) {
        require(likes[msg.sender][to].liked, "No existing like");

        likes[msg.sender][to].liked = false;
        likes[msg.sender][to].timestamp = 0;

        emit LikeRemoved(msg.sender, to);

        // Remove match if existed
        if (matches[msg.sender][to]) {
            matches[msg.sender][to] = false;
            matches[to][msg.sender] = false;
            emit MatchRemoved(msg.sender, to);
        }
    }

    /// Check if two users matched
    function isMatch(address user1, address user2) external view returns (bool) {
        return matches[user1][user2];
    }

    /// View if a user liked another user and when
    function getLikeInfo(address from, address to) external view returns (bool liked, uint256 timestamp) {
        Like memory l = likes[from][to];
        return (l.liked, l.timestamp);
    }

    /// Block a user (stop receiving likes/matches/messages)
    function blockUser(address userToBlock) external hasProfile(msg.sender) hasProfile(userToBlock) {
        require(msg.sender != userToBlock, "Cannot block yourself");
        require(!blocks[msg.sender][userToBlock].isBlocked, "Already blocked");

        blocks[msg.sender][userToBlock] = Blocked(true, block.timestamp);

        // Remove any existing likes/matches between them

        // Remove like from blocker to blocked
        if (likes[msg.sender][userToBlock].liked) {
            likes[msg.sender][userToBlock].liked = false;
            likes[msg.sender][userToBlock].timestamp = 0;
            emit LikeRemoved(msg.sender, userToBlock);
        }

        // Remove like from blocked to blocker
        if (likes[userToBlock][msg.sender].liked) {
            likes[userToBlock][msg.sender].liked = false;
            likes[userToBlock][msg.sender].timestamp = 0;
            emit LikeRemoved(userToBlock, msg.sender);
        }

        // Remove match if existed
        if (matches[msg.sender][userToBlock]) {
            matches[msg.sender][userToBlock] = false;
            matches[userToBlock][msg.sender] = false;
            emit MatchRemoved(msg.sender, userToBlock);
        }

        emit UserBlocked(msg.sender, userToBlock);
    }

    /// Unblock a previously blocked user
    function unblockUser(address userToUnblock) external hasProfile(msg.sender) {
        require(blocks[msg.sender][userToUnblock].isBlocked, "User not blocked");

        blocks[msg.sender][userToUnblock].isBlocked = false;
        blocks[msg.sender][userToUnblock].timestamp = 0;

        emit UserUnblocked(msg.sender, userToUnblock);
    }

    /// Check if userA blocked userB
    function isBlocked(address userA, address userB) external view returns (bool) {
        return blocks[userA][userB].isBlocked;
    }
}
