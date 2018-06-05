'use strict';

let azure = require('azure-storage');
let log = require('./log');
let config = require('./config');

let tableService = azure
    .createTableService(config.tableStorageConnectionString)
    .withFilter(new azure.LinearRetryPolicyFilter(5, 5000));
let gen = azure.TableUtilities.entityGenerator;

const agendaTable = 'agenda';
const conversationsTable = 'conversations';
const repliesTable = 'replies';
const metadataTable = 'metadata';

let agenda = [];

const getAgendaItemFromEntity = (entity) => {
    return {
        id: entity['RowKey']['_'],
        sequence: entity['sequence']['_'],
        segment: entity['segment'] ? entity['segment']['_'] : null,
        subSegment: entity['subSegment'] ? entity['subSegment']['_'] : false,
        start: entity['start'] ? entity['start']['_'] : null,
        title: entity['title'] ? entity['title']['_'] : null,
        speaker: entity['speaker'] ? entity['speaker']['_'] : null,
        activityType: entity['activityType'] ? entity['activityType']['_'] : null,
        hashtagActive: entity['hashtagActive'] ? entity['hashtagActive']['_'] : false
    };
}

const prepareAgenda = (agenda) => {
    agenda.sort((a,b) => a.sequence - b.sequence);
    for (let i = 0; i < agenda.length; i++) {
        if (i > 0) {
            agenda[i].prev = {
                id: agenda[i - 1].id,
                title: agenda[i - 1].title,
                speaker: agenda[i - 1].speaker,
                hashtagActive: agenda[i - 1].hashtagActive
            };
        }
        if (i < agenda.length - 1) {
            agenda[i].next = {
                id: agenda[i + 1].id,
                title: agenda[i + 1].title,
                speaker: agenda[i + 1].speaker,
                hashtagActive: agenda[i + 1].hashtagActive
            };
        }
    }
}

const init = (callback) => {
    let entities = [];
    getAllEntities(entities, agendaTable, null, null, (error, entities) => {
        if (error) {
            callback(error);
        } else {
            agenda.push(...entities.map(x => getAgendaItemFromEntity(x)));
            prepareAgenda(agenda);
            callback(null);
        }
    });
}

const getCurrentMetadata = (callback) => {
    tableService.retrieveEntity(metadataTable, '0', '0', null, (error, result) => {
        if (error) {
            error = `Failed to retrieve metadata entity: ${error}`;
            callback(error);
        } else {
            callback(null, {
                currentAgendaItemId: result['currentAgendaItemId']['_'],
                currentTeamId: result['currentTeamId']['_']
            });
        }
    });
}

const setCurrentMetadata = (metadata, callback) => {
    let entity = {
        PartitionKey: gen.String('0'),
        RowKey: gen.String('0'),
        currentAgendaItemId: gen.String(metadata.currentAgendaItemId),
        currentTeamId: gen.String(metadata.currentTeamId)
    };
    tableService.replaceEntity(metadataTable, entity, null, (error, result) => {
        if (error) {
            error = `Failed to replace metadata entity: ${error}`;
        }
        callback(error, result);
    });
}

const offsetCurrentAgendaItem = (offset, callback) => {
    getCurrentMetadata((error, metadata) => {
        if (error) {
            callback(error);
        } else {
            let id = metadata.currentAgendaItemId;
            let index = agenda.findIndex(x => x.id == id);
            if ((index + offset) >= 0 && (index + offset) < agenda.length) {
                index += offset;
            } else {
                callback(null, agenda[index], metadata.currentTeamId);
                return;
            }
            metadata.currentAgendaItemId = agenda[index].id;
            // Not really worried about the race condition here, this is admin only
            setCurrentMetadata(metadata, (error, result) => {
                if (error) {
                    callback(error);
                } else {
                    callback(null, agenda[index], metadata.currentTeamId);
                }
            });
        }
    });
}

const getCurrentAgendaItem = (callback) => {
    getCurrentMetadata((error, metadata) => {
        if (error) {
            callback(error);
        } else {
            callback(null, agenda.find(x => x.id == metadata.currentAgendaItemId), metadata.currentTeamId);
        }
    });
};

const setCurrentAgendaItem = (agendaItemId, callback) => {
    let index = agenda.findIndex(x => x.id == agendaItemId);
    if (index < 0) {
        callback(`Can't find ${agendaItemId}`);
    } else {
        getCurrentMetadata((error, metadata) => {
            if (error) {
                callback(error);
            } else {
                metadata.currentAgendaItemId = agendaItemId;
                // Not really worried about the race condition here, this is admin only
                setCurrentMetadata(metadata, (error, result) => {
                    if (error) {
                        callback(error);
                    } else {
                        callback(null, agenda[index], metadata.currentTeamId);
                    }
                });
            }
        });
    }
}

const newConversationEntity = (hashtag, conversationId, text, user) => {
    return {
        PartitionKey: gen.String(hashtag),
        RowKey: gen.String(conversationId),
        time: gen.String(new Date().toISOString()),
        text: gen.String(text),
        user: gen.String(user),
        replyCount: gen.Int32(0),
        replyLength: gen.Int32(0),
        replyUsers: gen.String('[]'),
        answerTime: gen.String(null),
        answerText: gen.String(null),
        answerUser: gen.String(null),
        isPinned: gen.Boolean(false),
        isHidden: gen.Boolean(false)
    };
}

const getConversationFromEntity = (entity) => {
    return {
        hashtag: entity['PartitionKey']['_'],
        id: entity['RowKey']['_'],
        time: entity['time']['_'],
        text: entity['text']['_'],
        user: entity['user']['_'],
        replyCount: entity['replyCount']['_'],
        replyLength: entity['replyLength']['_'],
        replyUsers: entity['replyUsers']['_'],
        answerTime: entity['answerTime'] ? entity['answerTime']['_'] : null,
        answerText: entity['answerText'] ? entity['answerText']['_'] : null,
        answerUser: entity['answerUser'] ? entity['answerUser']['_'] : null,
        isPinned: entity['isPinned'] ? entity['isPinned']['_'] : false,
        isHidden: entity['isHidden'] ? entity['isHidden']['_'] : false
    };
}

const updateConversationEntity = (entity, replyText, replyUser, answerResult, togglesResult) => {
    entity.replyCount = gen.Int32(entity['replyCount']['_'] + 1),
    entity.replyLength = gen.Int32(entity['replyLength']['_'] + replyText.length);
    let users = JSON.parse(entity['replyUsers']['_']);
    if (!users.includes(replyUser)) {
        users.push(replyUser);
    }
    entity.replyUsers = gen.String(JSON.stringify(users));
    if (answerResult.isAnswer) {
        entity.answerTime = gen.String(new Date().toISOString());
        entity.answerText = gen.String(answerResult.text);
        entity.answerUser = gen.String(replyUser);
    }
    if (togglesResult.isPin) {
        entity.isPinned = gen.Boolean(true);
    } else if (togglesResult.isUnpin) {
        entity.isPinned = gen.Boolean(false);
    }
    if (togglesResult.isHide) {
        entity.isHidden = gen.Boolean(true);
    } else if (togglesResult.isUnhide) {
        entity.isHidden = gen.Boolean(false);
    }
}

const newReplyEntity = (conversationId, replyId, text, user, isAnswer) => {
    return {
        PartitionKey: gen.String(conversationId),
        RowKey: gen.String(replyId),
        text: gen.String(text),
        user: gen.String(user),
        isAnswer: gen.Boolean(isAnswer)
    };
}

const getReplyFromEntity = (entity) => {
    return {
        conversationId: entity['PartitionKey']['_'],
        id: entity['RowKey']['_'],
        time: entity['Timestamp']['_'],
        text: entity['text']['_'],
        user: entity['user']['_'],
        isAnswer: entity['isAnswer']['_']
    }
}

const parseAnswer = (text) => {
    const answerCommand = '/answer';
    let isAnswer = text.toLowerCase().endsWith(answerCommand);
    return {
        isAnswer: isAnswer,
        text: isAnswer ? text.slice(0, -answerCommand.length).trim() : text
    }
}

const parseToggles = (text) => {
    let textLowercase = text.toLowerCase();
    return {
        isPin: textLowercase.endsWith('/pin'),
        isUnpin: textLowercase.endsWith('/unpin'),
        isHide: textLowercase.endsWith('/hide'),
        isUnhide: textLowercase.endsWith('/unhide')
    }
}

const insertNewConversation = (hashtag, conversationId, text, user, callback) => {
    let conversationEntity = newConversationEntity(hashtag, conversationId, text, user);
    tableService.insertEntity(conversationsTable, conversationEntity, null, (error, result) => {
        if (error) {
            callback(`Failed to insert new conversation entity for '${hashtag}': ${error}`);
        } else {
            callback(null);
        }
    });
}

const insertNewReply = (messageId, conversationId, text, user, callback) => {
    let answerResult = parseAnswer(text);
    let replyEntity = newReplyEntity(conversationId, messageId, text, user, answerResult.isAnswer);
    tableService.insertEntity(repliesTable, replyEntity, null, (error, result) => {
        if (error) {
            callback(`Failed to insert new reply entity: ${error}`);
        } else {
            callback(null);
        }
    });
}

const updateConversationWithRetry = (conversationId, text, user, retriesLeft, callback) => {
    let retry = () => {
        const maxRetryIntervalMs = 7000;
        retriesLeft -= 1;
        log.info(`Retrying update of conversation ${conversationId} (${retriesLeft} retries left)...`);
        setTimeout(() => {
            updateConversationWithRetry(conversationId, text, user, retriesLeft, callback);
        }, maxRetryIntervalMs/retriesLeft);
    };
    tableService.queryEntities(conversationsTable, new azure.TableQuery().where('RowKey == ?', conversationId), null, (error, result) => {
        if (error || result.entries.length == 0) {
            if (retriesLeft <= 0) {
                callback(`Failed to find parent conversation for this reply (no retries left)`);
            } else {
                retry();
            }
        } else if (result.entries.length > 1) {
            callback('Found more than one entry for the same conversation');
        } else {
            let conversationEntity = result.entries[0];
            let answerResult = parseAnswer(text);
            let togglesResult = parseToggles(text.toLowerCase());
            updateConversationEntity(conversationEntity, text, user, answerResult, togglesResult);
            tableService.replaceEntity(conversationsTable, conversationEntity, (error, result) => {
                if (error) {
                    if (retriesLeft <= 0) {
                        callback(`Failed to update conversation entity (no retries left): ${error}`);
                    } else {
                        retry();
                    }
                } else {
                    callback(null);
                }
            });
        }
    });
}

const addConversation = (hashtag, teamId, conversationId, text, user, callback) => {
    const callInsertNewConversation = (hashtag) => insertNewConversation(hashtag, conversationId, text, user, callback);
    if (hashtag == null || hashtag == '') {
        // Infer hashtag for new conversations without a hashtag in our current team
        getCurrentAgendaItem((error, agendaItem, currentTeamId) => {
            if (error) {
                callback(error);
            } else {
                if (teamId == currentTeamId) {
                    callInsertNewConversation(agendaItem.id);
                } else {
                    log.info(`Ignoring new conversation ${conversationId} in other team (${teamId} != ${currentTeamId})`);
                }
            }
        });
    } else {
        callInsertNewConversation(hashtag);
    }
}

const addReply = (messageId, conversationId, text, user, callback) => {
    insertNewReply(messageId, conversationId, text, user, (error, result) => {
        if (error) {
            callback(error);
        } else {
            updateConversationWithRetry(conversationId, text, user, 10/*retriesLeft*/, callback);
        }
    });
};

const getConversationsByHashtag = (hashtag, callback) => {
    let query = new azure.TableQuery().where('PartitionKey == ?', hashtag);
    tableService.queryEntities(conversationsTable, query, null, (error, result) => {
        if (error) {
            callback(`Failed to query conversations: ${error})`);
        } else {
            let conversations = [];
            for (let entity of result.entries) {
                conversations.push(getConversationFromEntity(entity));
            }
            callback(null, conversations);
        }
    });
}

const getRepliesByConversation = (conversationId, callback) => {
    let query = new azure.TableQuery().where('PartitionKey == ?', conversationId);
    tableService.queryEntities(repliesTable, query, null, (error, result) => {
        if (error) {
            callback(`Failed to query replies: ${error})`);
        } else {
            let replies = [];
            for (let entity of result.entries) {
                replies.push(getReplyFromEntity(entity));
            }
            callback(null, replies);
        }
    });
}

const getAllEntities = (entities, table, query, continuationToken, callback) => {
    tableService.queryEntities(table, query, continuationToken, (error, result) => {
        if (error) {
            callback(`Failed to query ${table}: ${error})`);
        } else {
            for (let entity of result.entries) {
                entities.push(entity);
            }
            if (result.continuationToken) {
                getAllEntities(entities, table, query, result.continuationToken, callback);
            } else {
                callback(null, entities);
            }
        }
    });
}

const getAllReplies = (callback) => {
    let entities = [];
    getAllEntities(entities, repliesTable, null, null, (error, entities) => {
        if (error) {
            callback(error);
        } else {
            let replies = entities.map(x => getReplyFromEntity(x));
            callback(null, replies);
        }
    });
}

const getAllConversations = (callback) => {
    let entities = [];
    getAllEntities(entities, conversationsTable, null, null, (error, entities) => {
        if (error) {
            callback(error);
        } else {
            let conversations = entities.map(x => getConversationFromEntity(x));
            callback(null, conversations);
        }
    });
}

module.exports.agenda = agenda;
module.exports.init = init;
module.exports.getCurrentAgendaItem = getCurrentAgendaItem;
module.exports.setCurrentAgendaItem = setCurrentAgendaItem;
module.exports.revertToPreviousAgendaItem = (callback) => { offsetCurrentAgendaItem(-1, callback); };
module.exports.advanceToNextAgendaItem = (callback) => { offsetCurrentAgendaItem(1, callback); };
module.exports.addConversation = addConversation;
module.exports.addReply = addReply;
module.exports.getConversationsByHashtag = getConversationsByHashtag;
module.exports.getRepliesByConversation = getRepliesByConversation;
module.exports.getAllReplies = getAllReplies;
module.exports.getAllConversations = getAllConversations;
