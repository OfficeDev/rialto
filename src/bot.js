'use strict';

let state = require('./state');
let config = require('./config');
let log = require('./log');
let puzzle = require('./puzzle');
puzzle.initSolutionEngine();

const getLogPrefix = (session) => {
    return `BOT (${session.message.user.name}/${session.message.address.conversation.conversationType})`;
}

const logError = (session, s) => {
    log.error(`${getLogPrefix(session)} ${s}`);
}

const logInfo = (session, s) => {
    log.info(`${getLogPrefix(session)} ${s}`);
}

const findFirstKnownHashtag = (text, agenda) => {
    let regexp = /\#[a-zA-Z0-9]+\b/g;
    let results = text.match(regexp);
    if (results) {
        for (let result of results) {
            for (let agendaItem of agenda) {
                if (agendaItem.hashtagActive && result.toLowerCase().substring(1) == agendaItem.id) {
                    return agendaItem.id;
                }
            }
        }
    }
    return null;
}

const isPersonal = (session) => {
    return session.message.address.conversation.conversationType == 'personal'
}

const isAdmin = (session) => {
    // For now, allow any 1:1 personal chat to execute admin commands
    // If desired, this could be restricted by name or AAD ID
    return isPersonal(session);
}

const getTeamChannelAddress = (teamId) => {
    return JSON.parse(`{
        "channelId": "msteams",
        "conversation": {
         "isGroup": true,
         "conversationType": "channel",
         "id": "${teamId}@thread.skype"
        },
        "bot": {
           "id": "28:${config.botAppId}",
           "name": "O3 Bot"
        },
        "serviceUrl": "https://smba.trafficmanager.net/amer-client-ss.msg/"
       }`);
}

const createAgendaItemCard = (builder, session, agendaItem) => {
    let card = new builder.ThumbnailCard(session)
        .title(`${agendaItem.title}`);
    if (agendaItem.speaker) {
        card.subtitle(agendaItem.speaker);
    }
    let textEntries = [];
    if (agendaItem.moreInfo) {
        textEntries.push(`More info: <a href="https://${agendaItem.moreInfo}">https://${agendaItem.moreInfo}</a>`)
    }
    if (agendaItem.hashtagActive) {
        textEntries.push(`Permalink: <a href="https://aka.ms/o3live#${agendaItem.id}">https://aka.ms/o3live#${agendaItem.id}</a>`);
    }
    let text = '';
    for (let i = 0; i < textEntries.length; i++) {
        text += textEntries[i];
        if (i < textEntries.length - 1) {
            text += '<br>';
        }
    }
    if (text != '') {
        card.text(text);
    }
    return card;
}

const handleAdminCommands = (bot, builder, session) => {
    if (isAdmin(session)) {
        const onAgendaItem = (error, agendaItem, currentTeamId) => {
            if (error) {
                logError(session, error);
                session.send(error);
            } else {
                if (agendaItem) {
                    session.send(`Current agenda item is now:<br>"${agendaItem.title}"`);
                    if (agendaItem.hashtagActive) {
                        let message = new builder.Message();
                        message.address(getTeamChannelAddress(currentTeamId));
                        message.attachments([createAgendaItemCard(builder, session, agendaItem)]);
                        bot.send(message);
                    }
                } else {
                    session.send('No current agenda item');
                }
            }
        };
        if (session.message.text == 'n') {
            state.advanceToNextAgendaItem(onAgendaItem);
            return true;
        } else if (session.message.text == 'p') {
            state.revertToPreviousAgendaItem(onAgendaItem);
            return true;
        } else if (session.message.text.startsWith('s ')) {
            state.setCurrentAgendaItem(session.message.text.substring(2), onAgendaItem);
            return true;
        }
    }
    return false;
}

const puzzleHelpText = `<br>To submit a puzzle solution, say:<br>"solve (puzzle name) - (answer)"`;

const handlePuzzleCommands = (session) => {
    let text = session.message.text.toLowerCase().trim();
    if (isPersonal(session)) {
        let solveCommand = 'solve ';
        if (text.startsWith(solveCommand) && text.includes('-')) {
            text = text.substring(solveCommand.length);
            let split = text.split('-');
            let puzzleName = split[0].trim();
            let answer = split[1].trim();
            session.send(puzzle.submitPuzzleSolution(puzzleName, answer));
            return true;
        }
    }
    return false;
}

const getTextPreview = (text) => {
    let maxLength = 30;
    if (text.length < maxLength) {
        return `"${text}"`;
    }
    return `"${text.substring(0, maxLength - 3)}..." (${text.length} chars)`;
}

const getTeamIdFromConversationid = (conversationId) => {
    return conversationId.substring(0, conversationId.indexOf('@thread.skype'));
}

const getShortConversationId = (conversationId) => {
    let regexp = /messageid=([0-9]+)$/;
    let results = conversationId.match(regexp);
    if (!results) {
        return conversationId.substring(0, 8);
    }
    return results[1];
}

const getCleanMessageText = (message) => {
    let text = message.text.trim();
    if (text.includes('</at>')) { // Remove @ mention tags
        text = text.replace(/<at>/g, '');
        text = text.replace(/<\/at>/g, '');
    }
    return text;
}

module.exports.setup = (app) => {
    let builder = require('botbuilder');
    let teams = require('botbuilder-teams');

    let connector = new teams.TeamsChatConnector({
        appId: config.botAppId,
        appPassword: config.botAppPassword
    });

    let bot = new builder.UniversalBot(connector, function(session) {
        try {
            // TODO: handle emojis
            let text = getCleanMessageText(session.message);
            let user = session.message.user.name;
            let messageId = session.message.address.id;
            let conversationType = session.message.address.conversation.conversationType;
           
            if (conversationType == 'personal') {
                logInfo(session, `Command ${getTextPreview(text)}`);
                if (handleAdminCommands(bot, builder, session)) {
                    return;
                }
                if (handlePuzzleCommands(session)) {
                    return;
                }
                session.send(`Sorry, I didn't recognize that.${puzzleHelpText}`);
            } else if (conversationType == 'channel') {
                let teamId = getTeamIdFromConversationid(session.message.address.conversation.id);
                let conversationId = getShortConversationId(session.message.address.conversation.id);
                let isReply = !session.message.address.conversation.id.endsWith(messageId);
                logInfo(session, `Message ${getTextPreview(text)}`);
                if (isReply) {
                    state.addReply(messageId, conversationId, text, user, (error) => {
                        if (error) {
                            logError(session, error);
                        } else {
                            logInfo(session, `Added reply ${messageId} to conversation ${conversationId}`);
                        }
                    });
                } else {
                    state.addConversation(findFirstKnownHashtag(text, state.agenda), teamId, conversationId, text, user, (error) => {
                        if (error) {
                            logError(session, error);
                        } else {
                            logInfo(session, `Added conversation ${conversationId}`);
                        }
                    });
                }
            }
        } catch (e) {
            logError(session, `${e.stack}`);
        }
    }).set('storage', null);

    app.post('/api/messages', connector.listen());

    module.exports.connector = connector;
};
