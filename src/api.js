'use strict';

let state = require('./state');
let log = require('./log');

const getLogPrefix = (req) => {
    return `API (${req.path})`;
}

const logError = (req, s) => {
    log.error(`${getLogPrefix(req)} ${s}`);
}

const logInfo = (req, s) => {
    log.info(`${getLogPrefix(req)} ${s}`);
}

const logGet = (req) => {
    logInfo(req, 'GET'); // Note, this is generally too spammy for production use
}

const getAgenda = (req, res) => {
    logGet(req);
    res.json(state.agenda);
}

const getAgendaItem = (req, res) => {
    logGet(req);
    if (req.params.hashtag == 'current') {
        state.getCurrentAgendaItem((error, agendaItem) => {
            if (error) {
                logError(req, error);
                res.status(500).send('Error');
            } else {
                res.json(agendaItem);
            }
        });    
    } else {
        let agendaItem = state.agenda.find(x => x.id == req.params.hashtag);
        if (agendaItem) {
            res.json(agendaItem);
        } else {
            logError(req, 'Not found');
            res.status(404).send('Not found');
        }
    }
}

const getConversations = (req, res) => {
    logGet(req);
    state.getConversationsByHashtag(req.params.hashtag, (error, conversations) => {
        if (error) {
            logError(req, error);
            res.status(500).send('Error');
        } else {
            res.json(conversations);
        }
    });
}

const getReplies = (req, res) => {
    logGet(req);
    state.getRepliesByConversation(req.params.conversationId, (error, replies) => {
        if (error) {
            logError(req, error);
            res.status(500).send('Error');
        } else {
            res.json(replies);
        }
    });
}

const getSearchResults = (req, res) => {
    logGet(req);
    let query = req.params.query; // If undefined, get everything
    state.getAllConversations((error, allConversations) => {
        if (error) {
            logError(req, error);
            res.status(500).send('Error');
        } else {
            state.getAllReplies((error, allReplies) => {
                if (error) {
                    logError(req, error);
                    res.status(500).send('Error');
                } else {
                    let conversationsIdsContainingQuery = new Set();
                    allConversations.forEach(x => {
                        if (!query || query == `#${x.hashtag}` || x.user.toLowerCase().includes(query) || x.text.toLowerCase().includes(query)) {
                            conversationsIdsContainingQuery.add(x.id);
                        }
                    });
                    allReplies.forEach(x => {
                        if (!query || x.user.toLowerCase().includes(query) || x.text.toLowerCase().includes(query)) {
                            conversationsIdsContainingQuery.add(x.conversationId);
                        }
                    });
                    let conversationsContainingQueryWithReplies = [];
                    conversationsIdsContainingQuery.forEach(x => {
                        let conversation = allConversations.find(y => y.id == x);
                        // Note, it's possible that we have replies for deleted parent conversations
                        if (conversation) {
                            conversation.replies = allReplies.filter(y => y.conversationId == x);
                            conversationsContainingQueryWithReplies.push(conversation);
                        }
                    });
                    res.json(conversationsContainingQueryWithReplies);
                }
            });
        }
    });
}

module.exports.setup = (app) => {
    app.get('/api/agenda', getAgenda);
    app.get('/api/agenda/:hashtag', getAgendaItem);
    app.get('/api/conversations/:hashtag', getConversations);
    app.get('/api/replies/:conversationId', getReplies);
    app.get('/api/search/:query', getSearchResults);
    app.get('/api/search', getSearchResults); // Get everything
}
