/*
 * Copyright 2016 the original author or authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */


define(function(require) {
	'use strict';

	var angular = require('angular');

    return ['$scope', '$http', '$injector', '$log', function ($scope, $http, $injector, $log) {

	var CodeMirror = require('codemirror');
	var enableTextToGraphSyncing = false;
	
	var doc;
	
	require('codemirror/addon/lint/lint');
	require('codemirror/addon/hint/show-hint');

    /**
     * Control graph-to-text syncing. When it is active the graph will be automatically
     * updated as the text is modified.
     */
	function enableGraphToTextSyncing(enable) {
		$scope.flo.enableSyncing(enable);
		enableTextToGraphSyncing = !enable;
	}

	//TODO: using a controller to setup codemirror is probably not the 'nice'
	// way to do that. (angular docs say that dom manipulations are not the job of a controller
	// so probably this should be a directive rather than a controller.

    // A bit dirty, we store the callback for codemirror linter here.
	// that way we can update markers each time error objects are
	// changed.
	var updateLinting; 
    
    /**
     * If new parse errors are discovered, this will create markers against
     * the editor text for them and call code mirror to update those markers.
     */
	function refreshMarkers() {
		var markers = [];
		var parseErrors = $scope.definition.parseError;
		if (parseErrors && parseErrors.length) {
			for (var i = 0; i < parseErrors.length; i++) {
				var parseError = parseErrors[i];
				if (parseError.message && parseError.range) {
					var range = parseError.range;
					markers.push({
						from: range.start,
						to: range.end,
						message: parseError.message.split(/\r?\n/)[0],
						severity: 'error'
					});
				}
			}
		}
		updateLinting(doc, markers);
	}
	
	function isDelimiter(c) {
		return c && (/\s|\|/).test(c);
	}
	
	function findLast(string, predicate, start) {
		var pos = start || string.length-1;
		while (pos>=0 && !predicate(string[pos])) {
			pos--;
		}
		return pos;
	}
	
	/**
	 * The suggestions provided by rest api are very long and include the whole command typed
	 * from the start of the line. This function determines the start of the 'interesting' part
	 * at the end of the prefix, so that we can use it to chop-off the suggestion there.
	 */
	function interestingPrefixStart(prefix, completions) {
		var cursor = prefix.length;
		if (completions.every(function (completion) { return isDelimiter(completion[cursor]);})) {
			return cursor;
		}
		return findLast(prefix, isDelimiter);
	}
	
	function contentAssist(doc, callback) {
		var cursor = doc.getCursor();
		var startOfLine = {line: cursor.line, ch: 0};
		var prefix = doc.getRange(startOfLine, cursor);
		
		if ($scope.contentAssistServiceName) {
			var caService = $injector.get($scope.contentAssistServiceName);
			if (caService && angular.isFunction(caService.getProposals)) {
				return caService.getProposals(prefix).then(function(completions) {
					var chopAt = interestingPrefixStart(prefix, completions); 
					return callback({
						list: completions.map(function (longCompletion) {
							var text = typeof longCompletion === 'string' ? longCompletion : longCompletion.text;
							return text.substring(chopAt);
						}),
						from: {line: startOfLine.line, ch:chopAt},
						to: cursor
					});
				}, function(err) {
					$log.error('Cannot get content assist: ' + err);
				});
			}
		} 
	}
		
	$scope.init = function(textarea) {
		contentAssist.async = true;
		doc = CodeMirror.fromTextArea(textarea, {
			gutters: ['CodeMirror-lint-markers'],
			lint: {
				async: true,
				getAnnotations: function (text, updateFun) {
					if (!updateLinting) {
						updateLinting = updateFun;
						$scope.$watch('definition.parseError', refreshMarkers);
					}
				}
			},
			extraKeys: {'Ctrl-Space': 'autocomplete'},
			hintOptions: {
				async: 'true',
				hint: contentAssist
			},
		    lineNumbers: true,
		    lineWrapping: true
		});
		doc.on('change', function () {
			if (enableTextToGraphSyncing) {
				$scope.definition.text = doc.getValue();
				$scope.flo.scheduleUpdateGraphRepresentation();
			}
		});
		doc.on('focus', function () {
			enableGraphToTextSyncing(false);
		});
		doc.on('blur', function () {
			enableGraphToTextSyncing(true);
		});
		$scope.$watch('definition.text', function (newValue) {
			if (newValue!==doc.getValue()) {
				var cursorPosition = doc.getCursor();
				doc.setValue(newValue);
				doc.setCursor(cursorPosition);
			}
		});
	};
		
    }];

});