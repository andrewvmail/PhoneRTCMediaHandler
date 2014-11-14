/**
 * @fileoverview MediaHandler
 */

/**
 * MediaHandler
 * @class PeerConnection helper Class.
 * @param {SIP.Session} session
 * @param {Object} [options]
 */
module.exports = function(SIP) {
	/**
	 * Implements the PhoneRTC media handler constructor.
	 */
	var PhoneRTCMediaHandler = function(session, options) {
		// Create a logger.
  	window.console.log('Loading the PhoneRTC 2.0 Media Handler.');

  	// Try to use a Turn server provided by sip.js.
  	var turnServers = [];
  	if(options) {
  		turnServers = options.turnServers;
  	} else {
  		turnServers = session.ua.configuration.turnServers;
  	}
  	if(turnServers && turnServers.length > 0) {
  		this.turnServer = {
  			'host': turnServers[0].urls,
  	    'username': turnServers[0].username,
  	    'password': turnServers[0].password
  		};
  	} else {
  		this.turnServer = {
  			'host': 'turn:54.191.155.251',
        'username': 'bettervoice',
        'password': 'B3tt3rV01c3'
  		};
  	}

  	// Finish initialization.
  	this.phonertc = {
  		/*
  		 * Possible states are:
  		 * - disconnected
  		 * - connected
  		 * - muted
       */
  		'state': 'disconnected'
  	};
	}

	PhoneRTCMediaHandler.prototype = Object.create(SIP.MediaHandler.prototype, {
		/**
		 * render() is called by sip.js so it must be defined but 
		 * rendering is handled by the PhoneRTC plugin.
		 */
		render: {writable: true, value: function render() { }},

  	isReady: {writable: true, value: function isReady() { return true; }},

  	close: {writable: true, value: function close() {
  		var state = this.phonertc.state;
  		if(state !== 'disconnected') {
  			this.phonertc.session.close({'sessionKey': '0'});
  			this.phonertc.session = null;
  			// Update our state.
  			this.phonertc.state = 'disconnected';
  		}
  	}},

  	getDescription: {writable: true, value: function getDescription(onSuccess, onFailure, mediaHint) {
      var phonertc = this.phonertc;
      var isInitiator = !phonertc.session;
  		if(isInitiator) {
        this.startSession(isInitiator, onSuccess, onFailure);
        phonertc.session.call({'sessionKey': '0'});
      } else {
        onSuccess(phonertc.sdp);
      }
  	}},

  	setDescription: {writable: true, value: function setDescription(sdp, onSuccess, onFailure) {
  		var phonertc = this.phonertc;
      var isInitiator = !phonertc.session;
  		if(isInitiator) {
        this.startSession(false);
      }
  		var session = this.phonertc.session;
  		if(phonertc.role === 'caller') {
  			session.receiveMessage({'sessionKey': '0', 'type': 'answer', 'sdp': sdp});
  		} else if(phonertc.role === 'callee') {
  			session.receiveMessage({'sessionKey': '0', 'type': 'offer', 'sdp': sdp});
        session.call({'sessionKey': '0'});
  		}
  		this.phonertc.state = 'connected';
      onSuccess();
  	}},

  	isMuted: {writable: true, value: function isMuted() {
  	  return {
  	    audio: this.phonertc.state === 'muted',
  	    video: true
  	  };
  	}},

  	mute: {writable: true, value: function mute(options) {
  		var state = this.phonertc.state;
  		if(state === 'connected') {
  			var session = this.phonertc.session;
  			session.streams.audio = false;
				session.renegotiate({'sessionKey': '0'});
  			this.phonertc.state = 'muted';
  		}
  	}},

  	unmute: {writable: true, value: function unmute(options) {
  		var state = this.phonertc.state;
  		if(state === 'muted') {
  			var session = this.phonertc.session;
  			session.streams.audio = true;
				session.renegotiate({'sessionKey': '0'});
  			this.phonertc.state = 'connected';
  		}
  	}},

    hold: {writable: true, value: function hold () {
      this.mute();
    }},

    unhold: {writable: true, value: function unhold () {
      this.unmute();
    }},

  	// Local Methods.
  	startSession: {writable: true, value: function startSession(isInitiator, onSuccess, onFailure) {
      var phonertc = this.phonertc;
  		phonertc.role = isInitiator ? 'caller' : 'callee';
  		var config = {
        sessionKey: '0',
  			isInitiator: isInitiator,
    		turn: this.turnServer,
    		streams: {
    			audio: true,
    			video: false
    		}
  		};
      // Unfortunately, there is no message to let us know
      // that PhoneRTC has finished gathering ice candidates.
      // We use a watchdog to make sure all the ICE candidates
      // are allocated before returning the SDP.
      var allocating = false;
      var watchdog = null;
      phonertc.session = new cordova.plugins.phonertc.Session(config);
      phonertc.session.on('sendMessage', function (data) {
        if(data.type === 'offer' || data.type === 'answer') {
          phonertc.sdp = data.sdp;
        } else if(data.type === 'candidate') {
          // If we receive another candidate we stop
          // the watchdog and restart it again later.
          if(watchdog) {
            clearTimeout(watchdog);
          } else {
            allocating = true;
          }
          // Append the candidate to the SDP.
          var candidate = "a=" + data.candidate + "\r\n";
          if(data.id === 'audio') {
            phonertc.sdp += candidate;
          }
          // Start the watchdog.
          watchdog = setTimeout(function() {
            if(!allocating) {
              // Finish session description before we return it.
              if(phonertc.role !== 'caller') {
                phonertc.sdp = phonertc.sdp.replace('a=setup:actpass', 'a=setup:passive');
              }
              phonertc.sdp = phonertc.sdp.replace(/a=crypto.*\r\n/g, '');
              // If an on success callback has been provided
              // lets go ahead and give it the final sdp.
              if(onSuccess) { onSuccess(phonertc.sdp); }
            } else {
              allocating = false;
            }
          }, 100);
        }
      });
  	}}
	});

	// Return the PhoneRTC media handler implementation.
	return PhoneRTCMediaHandler;
};
