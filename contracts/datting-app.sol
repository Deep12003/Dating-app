// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract DatingApp {
    struct Profile {
        string ipfsHash;
        bool verified;
        uint256 createdAt;
        uint256 updatedAt;
        bool active;
        bool isPublic;
    }

    struct Like {
        bool liked;
        uint256 timestamp;
    }

    struct Blocked {
        bool isBlocked;
        uint256 timestamp;
    }

    struct Message {
        address from;
        uint256 timestamp;
        string content;
    }

    mapping(address => Profile) public profiles;
    mapping(address => mapping(address => Like)) private likes;
    mapping(address => mapping(address => bool)) public matches;
    mapping(address => mapping(address => Blocked)) private blocks;
    mapping(address => mapping(address => Message[])) private messages;
    mapping(address => bool) public blacklist;

    address[] private activeUsers;
    mapping(address => bool) private isActiveUser;

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
    event MessageSent(address indexed from, address indexed to, string content);
    event ChatCleared(address indexed user1, address indexed user2);



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

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Invalid new owner");
        owner = newOwner;
    }

    function blacklistUser(address user) external onlyOwner {
        blacklist[user] = true;
        emit Blacklisted(user);
    }

    function whitelistUser(address user) external onlyOwner {
        blacklist[user] = false;
        emit Whitelisted(user);
    }

    function setProfile(string calldata ipfsHash, bool isPublic) external notBlacklisted(msg.sender) {
        require(bytes(ipfsHash).length > 0, "IPFS hash required");

        if (profiles[msg.sender].createdAt == 0) {
            profiles[msg.sender] = Profile({
                ipfsHash: ipfsHash,
                verified: false,
                createdAt: block.timestamp,
                updatedAt: block.timestamp,
                active: true,
                isPublic: isPublic
            });
            if (!isActiveUser[msg.sender]) {
                activeUsers.push(msg.sender);
                isActiveUser[msg.sender] = true;
            }
            emit ProfileCreated(msg.sender, ipfsHash);
        } else {
            profiles[msg.sender].ipfsHash = ipfsHash;
            profiles[msg.sender].updatedAt = block.timestamp;
            profiles[msg.sender].isPublic = isPublic;

            if (!profiles[msg.sender].active) {
                profiles[msg.sender].active = true;
                if (!isActiveUser[msg.sender]) {
                    activeUsers.push(msg.sender);
                    isActiveUser[msg.sender] = true;
                }
                emit ProfileCreated(msg.sender, ipfsHash);
            } else {
                emit ProfileUpdated(msg.sender, ipfsHash);
            }
        }
    }

    function deleteProfile() external hasProfile(msg.sender) {
        profiles[msg.sender].active = false;
        isActiveUser[msg.sender] = false;

        for (uint256 i = 0; i < activeUsers.length; i++) {
            if (activeUsers[i] == msg.sender) {
                activeUsers[i] = activeUsers[activeUsers.length - 1];
                activeUsers.pop();
                break;
            }
        }

        emit ProfileDeleted(msg.sender);
    }

    function verifyUser(address user) external onlyOwner hasProfile(user) {
        require(!profiles[user].verified, "Already verified");
        profiles[user].verified = true;
        emit Verified(user);
    }

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

    function unlikeUser(address to) external hasProfile(msg.sender) hasProfile(to) {
        require(likes[msg.sender][to].liked, "No existing like");

        likes[msg.sender][to].liked = false;
        likes[msg.sender][to].timestamp = 0;

        emit LikeRemoved(msg.sender, to);

        if (matches[msg.sender][to]) {
            matches[msg.sender][to] = false;
            matches[to][msg.sender] = false;
            emit MatchRemoved(msg.sender, to);
        }
    }

    function isMatch(address user1, address user2) external view returns (bool) {
        return matches[user1][user2];
    }

    function getLikeInfo(address from, address to) external view returns (bool liked, uint256 timestamp) {
        Like memory l = likes[from][to];
        return (l.liked, l.timestamp);
    }

    function blockUser(address userToBlock) external hasProfile(msg.sender) hasProfile(userToBlock) {
        require(msg.sender != userToBlock, "Cannot block yourself");
        require(!blocks[msg.sender][userToBlock].isBlocked, "Already blocked");

        blocks[msg.sender][userToBlock] = Blocked(true, block.timestamp);

        if (likes[msg.sender][userToBlock].liked) {
            likes[msg.sender][userToBlock].liked = false;
            likes[msg.sender][userToBlock].timestamp = 0;
            emit LikeRemoved(msg.sender, userToBlock);
        }

        if (likes[userToBlock][msg.sender].liked) {
            likes[userToBlock][msg.sender].liked = false;
            likes[userToBlock][msg.sender].timestamp = 0;
            emit LikeRemoved(userToBlock, msg.sender);
        }

        if (matches[msg.sender][userToBlock]) {
            matches[msg.sender][userToBlock] = false;
            matches[userToBlock][msg.sender] = false;
            emit MatchRemoved(msg.sender, userToBlock);
        }

        emit UserBlocked(msg.sender, userToBlock);
    }

    function unblockUser(address userToUnblock) external hasProfile(msg.sender) {
        require(blocks[msg.sender][userToUnblock].isBlocked, "User not blocked");

        blocks[msg.sender][userToUnblock].isBlocked = false;
        blocks[msg.sender][userToUnblock].timestamp = 0;

        emit UserUnblocked(msg.sender, userToUnblock);
    }

    function isBlocked(address userA, address userB) external view returns (bool) {
        return blocks[userA][userB].isBlocked;
    }

    function sendMessage(address to, string calldata content) external hasProfile(msg.sender) hasProfile(to) {
        require(matches[msg.sender][to], "You are not matched");
        require(!blocks[to][msg.sender].isBlocked, "You are blocked by user");
        require(!blocks[msg.sender][to].isBlocked, "You blocked this user");
        require(bytes(content).length > 0, "Message content required");

        Message memory newMsg = Message(msg.sender, block.timestamp, content);
        messages[msg.sender][to].push(newMsg);
        messages[to][msg.sender].push(newMsg);

        emit MessageSent(msg.sender, to, content);
    }

    function getMessageCount(address user1, address user2) external view returns (uint256) {
        return messages[user1][user2].length;
    }

    function getMessage(address user1, address user2, uint256 index) external view returns (address from, uint256 timestamp, string memory content) {
        require(index < messages[user1][user2].length, "Invalid message index");
        Message storage m = messages[user1][user2][index];
        return (m.from, m.timestamp, m.content);
    }

    function getActiveUsers() external view returns (address[] memory) {
        uint256 count = 0;
        for (uint256 i = 0; i < activeUsers.length; i++) {
            if (profiles[activeUsers[i]].active) {
                count++;
            }
        }

        address[] memory result = new address[](count);
        uint256 index = 0;
        for (uint256 i = 0; i < activeUsers.length; i++) {
            if (profiles[activeUsers[i]].active) {
                result[index++] = activeUsers[i];
            }
        }

        return result;
    }

    function getProfile(address user) external view returns (string memory ipfsHash, bool verified, bool active, bool isPublic) {
        Profile memory p = profiles[user];
        require(p.active, "Profile not active");
        require(p.isPublic || msg.sender == user, "Profile is private");
        return (p.ipfsHash, p.verified, p.active, p.isPublic);
    }

    function getMatches() external view hasProfile(msg.sender) returns (address[] memory) {
        uint256 count = 0;
        for (uint256 i = 0; i < activeUsers.length; i++) {
            if (matches[msg.sender][activeUsers[i]]) {
                count++;
            }
        }

        address[] memory result = new address[](count);
        uint256 idx = 0;
        for (uint256 i = 0; i < activeUsers.length; i++) {
            if (matches[msg.sender][activeUsers[i]]) {
                result[idx++] = activeUsers[i];
            }
        }
        return result;
    }
    function clearChat(address withUser) external hasProfile(msg.sender) hasProfile(withUser) {
    require(msg.sender != withUser, "Cannot clear chat with yourself");

    delete messages[msg.sender][withUser];
    delete messages[withUser][msg.sender];

    emit ChatCleared(msg.sender, withUser); 
    }
}
